import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { ChatGPTService, readChatGPTStream, type ChatGPTAuthPort } from '../server/chatgpt.js';
import { LearningError } from '../server/provider.js';
import { registerLearningRoutes } from '../server/learning.js';
import type { ChatGPTStatus } from '../shared/learning.js';
import type { Snapshot, SourceFile } from '../shared/types.js';

type AuthState = Awaited<ReturnType<ChatGPTAuthPort['status']>>;
class AuthFixture implements ChatGPTAuthPort {
  state: AuthState = {
    available: true,
    connected: true,
    sharing: true,
    profileId: 'profile-one',
    email: 'synthetic@example.test',
    phase: 'connected',
    storage: 'encrypted',
  };
  reads = 0;
  requests = new Set<AbortController>();
  finish?: () => void;
  async status() {
    return { ...this.state, internalCredential: 'must-not-reach-renderer' };
  }
  async start() {
    this.state.phase = 'connecting';
    await new Promise<void>((resolve) => {
      this.finish = resolve;
    });
    this.state.phase = this.state.connected ? 'connected' : 'idle';
  }
  cancel() {
    this.finish?.();
  }
  async disconnect() {
    for (const controller of this.requests) controller.abort();
    this.state = {
      available: true,
      connected: false,
      sharing: false,
      phase: 'idle',
      storage: 'encrypted',
    };
    this.cancel();
  }
  async withAccess<T>(
    profileId: string,
    operation: (token: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    if (!this.state.sharing || this.state.profileId !== profileId)
      throw new LearningError('Account changed', 409, 'chatgpt_profile_changed');
    const controller = new AbortController();
    this.requests.add(controller);
    this.reads++;
    try {
      return await operation(
        'synthetic-oauth-secret',
        AbortSignal.any([controller.signal, ...(signal ? [signal] : [])]),
      );
    } finally {
      this.requests.delete(controller);
    }
  }
}
const event = (value: unknown) => 'data: ' + JSON.stringify(value) + '\r\n\r\n';
function completed(text: string): Response {
  return new Response(
    event({ type: 'response.output_text.delta', delta: text.slice(0, 8) }) +
      event({
        type: 'response.completed',
        response: {
          status: 'completed',
          output: [
            { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] },
          ],
        },
      }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
}
const catalog = () =>
  Response.json({
    models: [
      { slug: 'fixture-small', display_name: 'Small fixture', visibility: 'list' },
      { slug: 'fixture-hidden', display_name: 'Internal fixture', visibility: 'hidden' },
      { visibility: 'hidden', internalOnly: true },
      { slug: 'fixture-large', display_name: 'Large fixture', visibility: 'list' },
    ],
  });

test('ChatGPT stream requires a terminal completion and never treats failed partial output as success', async () => {
  assert.equal(
    await readChatGPTStream(completed('Explicación con ñ y código.')),
    'Explicación con ñ y código.',
  );
  const bytes = new TextEncoder().encode(
    event({ type: 'response.output_text.delta', delta: 'sí' }) +
      event({ type: 'response.completed', response: { status: 'completed' } }),
  );
  const chunks = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    },
  });
  assert.equal(await readChatGPTStream(new Response(chunks)), 'sí');
  await assert.rejects(
    readChatGPTStream(
      new Response(event({ type: 'response.output_text.delta', delta: 'Partial' })),
    ),
    /antes de que/,
  );
  await assert.rejects(
    readChatGPTStream(new Response(event({ type: 'response.incomplete', response: {} }))),
    /incompleta/,
  );
  await assert.rejects(
    readChatGPTStream(
      new Response(
        event({ type: 'response.output_text.delta', delta: 'Partial' }) +
          event({ type: 'response.completed', response: { status: 'failed' } }),
      ),
    ),
    /no confirmó/,
  );
  await assert.rejects(
    readChatGPTStream(
      new Response(
        event({
          type: 'response.completed',
          response: { status: 'completed', error: { code: 'synthetic_error' } },
        }),
      ),
    ),
    /no pudo completar/,
  );
  await assert.rejects(
    readChatGPTStream(
      new Response(
        event({ type: 'response.output_text.delta', delta: 'Partial' }) +
          event({
            type: 'response.failed',
            response: {
              error: {
                code: 'subscription_sharing_usage_limit_exceeded',
                message: 'sensitive upstream body',
              },
            },
          }),
      ),
    ),
    (error) => {
      assert(error instanceof LearningError);
      assert.equal(error.status, 429);
      assert.equal(error.code, 'subscription_sharing_usage_limit_exceeded');
      assert(!error.message.includes('sensitive'));
      return true;
    },
  );
  await assert.rejects(
    readChatGPTStream(Response.json({ detail: 'secret downstream content' }, { status: 403 })),
    (error) => {
      assert(error instanceof LearningError);
      assert.equal(error.status, 403);
      assert(!error.message.includes('secret downstream'));
      return true;
    },
  );
  await assert.rejects(
    readChatGPTStream(new Response('data: ' + 'x'.repeat(1_000_001))),
    /supera el límite/,
  );
});

test('ChatGPT requests use only the confirmed account, fixed public Responses endpoint and granted model', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trama-chatgpt-'));
  const auth = new AuthFixture();
  const requests: { url: string; body?: Record<string, unknown>; authorization: string | null }[] =
    [];
  const transport: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: new Headers(init?.headers).get('Authorization'),
    });
    return String(url).endsWith('/models') ? catalog() : completed('Final model content');
  };
  try {
    const service = new ChatGPTService(directory, { auth, fetch: transport });
    await assert.rejects(
      service.complete('Instruction', 'Private source', {
        allowRemote: false,
        expectedProfileId: 'profile-one',
      }),
      /Autoriza/,
    );
    await assert.rejects(
      service.complete('Instruction', 'Private source', { allowRemote: true }),
      /Confirma/,
    );
    assert.equal(requests.length, 0);
    const state = await service.status();
    assert.deepEqual(
      state.models.map((model) => model.slug),
      ['fixture-small', 'fixture-large'],
    );
    assert(!JSON.stringify(state).includes('synthetic-oauth-secret'));
    assert(!JSON.stringify(state).includes('must-not-reach-renderer'));
    await assert.rejects(
      service.complete('Instruction', 'Private source', {
        allowRemote: true,
        expectedProfileId: 'different-account',
      }),
      /cambió/,
    );
    await assert.rejects(
      service.complete('Instruction', 'Private source', {
        allowRemote: true,
        expectedProfileId: 'profile-one',
        model: 'fixture-hidden',
      }),
      /no está disponible/,
    );
    assert.equal(requests.length, 1);
    const result = await service.complete('Use only this source', 'synthetic private code', {
      allowRemote: true,
      expectedProfileId: 'profile-one',
      model: 'fixture-large',
    });
    assert.deepEqual(result, { content: 'Final model content', model: 'fixture-large' });
    assert.equal(requests[1].url, 'https://api.openai.com/v1/responses');
    assert.equal(requests[1].authorization, 'Bearer synthetic-oauth-secret');
    assert.deepEqual(requests[1].body, {
      model: 'fixture-large',
      instructions: 'Use only this source',
      input: [{ role: 'user', content: 'synthetic private code' }],
      store: false,
      stream: true,
    });
    await service.selectModel('fixture-large');
    await service.acknowledgeWelcome();
    const saved = await readFile(join(directory, 'chatgpt-preferences.json'), 'utf8');
    assert.deepEqual(JSON.parse(saved), { model: 'fixture-large', welcomeSeen: true });
    assert(!saved.includes('secret'));
    const reopened = new ChatGPTService(directory, { auth, fetch: transport });
    assert.equal((await reopened.status()).welcomeSeen, true);
    assert.equal((await reopened.status()).model, 'fixture-large');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('connection stays pending without blocking, missing plan permission prevents requests and disconnect aborts inference', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trama-chatgpt-flow-'));
  const auth = new AuthFixture();
  auth.state.connected = false;
  auth.state.sharing = false;
  auth.state.phase = 'idle';
  let requests = 0;
  let inferenceStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => {
    inferenceStarted = resolve;
  });
  const transport: typeof fetch = async (url, init) => {
    requests++;
    if (String(url).endsWith('/models')) return catalog();
    inferenceStarted?.();
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener(
        'abort',
        () => reject(new DOMException('Aborted', 'AbortError')),
        { once: true },
      );
    });
  };
  try {
    const service = new ChatGPTService(directory, { auth, fetch: transport });
    const pending = await service.connect();
    assert.equal(pending.phase, 'connecting');
    assert.equal(requests, 0);
    await service.cancel();
    await assert.rejects(
      service.complete('instruction', 'source', {
        allowRemote: true,
        expectedProfileId: 'profile-one',
      }),
      /permite usar/,
    );
    assert.equal(requests, 0);
    auth.state.connected = true;
    auth.state.sharing = true;
    auth.state.phase = 'connected';
    const completion = service.complete('instruction', 'source', {
      allowRemote: true,
      expectedProfileId: 'profile-one',
    });
    const rejected = assert.rejects(completion);
    await started;
    await service.disconnect();
    await rejected;
    assert.equal((await service.status()).connected, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('catalog failures remain visible without polling retries until an explicit refresh', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trama-chatgpt-catalog-'));
  let requests = 0,
    unavailable = true;
  const service = new ChatGPTService(directory, {
    auth: new AuthFixture(),
    fetch: async () => {
      requests++;
      return unavailable
        ? Response.json(
            { error: { code: 'subscription_sharing_usage_unavailable' } },
            { status: 503 },
          )
        : catalog();
    },
  });
  try {
    const failed = await service.status();
    assert.equal(failed.phase, 'error');
    assert.equal(failed.errorCode, 'subscription_sharing_usage_unavailable');
    assert.deepEqual(failed.models, []);
    await service.status();
    assert.equal(requests, 1);
    unavailable = false;
    const retried = await service.refresh();
    assert.equal(requests, 2);
    assert.equal(retried.models.length, 2);
    assert.equal(retried.error, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('ChatGPT learning HTTP path keeps source citation validation and never falls back to another provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'trama-chatgpt-http-'));
  const source: SourceFile = { path: 'total.ts', text: 'export const total = 3 * 250;', size: 29 };
  const snapshot: Snapshot = {
    id: 'fixture',
    projectId: 'project',
    name: 'Fixture',
    source: 'example',
    location: 'fixture',
    revision: 'revision',
    createdAt: new Date().toISOString(),
    files: [{ path: source.path, size: source.size }],
    coverage: { indexed: 1, skipped: 0, bytes: source.size, limitations: [] },
    plan: { summary: 'Fixture', architecture: [], features: [], coverage: {} },
    graph: { nodes: [], edges: [] },
    learning: {},
    learningVersion: 0,
  };
  const auth = new AuthFixture();
  let requests = 0;
  const service = new ChatGPTService(directory, {
    auth,
    fetch: async (url) => {
      if (String(url).endsWith('/models')) return catalog();
      requests++;
      return completed(
        JSON.stringify({
          summary: 'Total',
          claims: [
            {
              text: '3 * 250',
              status: 'source',
              sources: [{ path: 'total.ts', line: 1, end: 1, excerpt: 'fake' }],
            },
            {
              text: 'Not in the source',
              status: 'source',
              sources: [{ path: 'private.ts', line: 1, end: 1 }],
            },
          ],
          nextQuestion: 'What changes with four units?',
        }),
      );
    },
  });
  const app = express();
  app.use(express.json());
  registerLearningRoutes(app, {
    getSnapshot: () => snapshot,
    getFiles: () => [source],
    dataDir: directory,
    chatgpt: service,
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const post = (route: string, body: unknown) =>
    fetch(base + route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    const status = (await (await fetch(base + '/api/chatgpt/status')).json()) as ChatGPTStatus;
    assert.equal(status.profileId, 'profile-one');
    assert.equal(
      (
        await post('/api/snapshots/fixture/ask', {
          question: 'Explain total',
          provider: 'chatgpt',
          allowRemote: false,
          expectedProfileId: 'profile-one',
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post('/api/snapshots/fixture/ask', {
          question: 'Explain total',
          provider: 'chatgpt',
          allowRemote: true,
          expectedProfileId: 'old-profile',
        })
      ).status,
      409,
    );
    assert.equal(requests, 0);
    const response = await post('/api/snapshots/fixture/ask', {
      question: 'Explain total',
      provider: 'chatgpt',
      allowRemote: true,
      expectedProfileId: 'profile-one',
    });
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.provider, 'chatgpt');
    assert.equal(result.answer.claims[0].sources[0].excerpt, source.text);
    assert.equal(result.answer.claims[1].status, 'unknown');
    assert.equal(result.context.rejectedReferences, 1);
    assert.equal(requests, 1);
    assert.equal((await (await post('/api/chatgpt/welcome', {})).json()).welcomeSeen, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
});
