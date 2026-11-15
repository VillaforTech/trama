import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Store, AppError } from '../server/database.js';
import { importRepository, readLocal } from '../server/repository.js';
import { createApp } from '../server/index.js';
import type { AddressInfo } from 'node:net';
import { request } from 'node:http';

test('local index excludes secret files, gitignored paths, symlinks and binaries, without executing source', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trama-source-'));
  try {
    await writeFile(path.join(root, '.gitignore'), 'ignored/\n*.cache\n');
    await writeFile(path.join(root, 'README.md'), '# Ejemplo\n\nUn servicio de pedidos.');
    await writeFile(
      path.join(root, 'main.ts'),
      'import {total} from "./total.js";\nexport function run(){return total(3);}\nthrow new Error("must not execute");',
    );
    await writeFile(
      path.join(root, 'total.ts'),
      'export function total(units: number) { return units * 250; }',
    );
    await writeFile(path.join(root, '.env'), 'PASSWORD=private');
    await writeFile(
      path.join(root, 'credential.ts'),
      'const credential = "' + 'ghp_' + 'x'.repeat(36) + '";',
    );
    await writeFile(path.join(root, 'binary.ts'), Buffer.from([0, 1, 2, 3]));
    await mkdir(path.join(root, 'ignored'));
    await writeFile(path.join(root, 'ignored', 'file.ts'), 'export const secret=1;');
    await symlink(path.join(root, '.env'), path.join(root, 'linked.ts'));
    const read = await readLocal(root);
    assert(read.files.some((file) => file.path === 'main.ts'));
    assert(!read.files.some((file) => /env|credential|binary|ignored|linked/.test(file.path)));
    assert(read.skipped >= 5);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('snapshots survive reload, retain source anchors, reject conflicting writes and isolate revisions', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'trama-store-'));
  const source = path.join(root, 'source'),
    data = path.join(root, 'db');
  await mkdir(source);
  await writeFile(path.join(source, 'README.md'), '# Ejemplo\n\nSistema de pedidos.');
  await writeFile(
    path.join(source, 'main.ts'),
    'import { total } from "./price.js";\nexport function createOrder(units: number) { return total(units); }',
  );
  await writeFile(
    path.join(source, 'price.ts'),
    'export function total(units: number) { return units * 250; }',
  );
  let store = new Store(data);
  try {
    const before = await importRepository({ kind: 'local', path: source }, store);
    assert(before.plan.features.length > 0);
    assert(
      before.graph.edges.some((edge) => edge.source === 'main.ts' && edge.target === 'price.ts'),
    );
    assert.throws(
      () =>
        store.saveLearning(
          before.id,
          {
            sessions: [
              { id: 'malformed', question: 'q', answer: null, createdAt: new Date().toISOString() },
            ],
          },
          0,
        ),
      /sesión/,
    );
    assert.equal(store.snapshot(before.id)!.learningVersion, 0);
    assert.throws(
      () =>
        store.saveLearning(
          before.id,
          {
            sessions: [
              {
                id: 'unsupported',
                question: 'What does this code guarantee?',
                createdAt: new Date().toISOString(),
                answer: {
                  summary: 'Unsupported statement',
                  claims: [{ text: 'A fabricated guarantee.', status: 'source', sources: [] }],
                  nextQuestion: 'Why?',
                },
              },
            ],
          },
          0,
        ),
      /afirmación/,
    );
    assert.equal(store.snapshot(before.id)!.learningVersion, 0);
    const saved = store.saveLearning(before.id, { notes: 'Costo por unidad' }, 0);
    assert.equal(saved.version, 1);
    assert.throws(
      () => store.saveLearning(before.id, { notes: 'stale' }, 0),
      (error: unknown) => error instanceof AppError && error.status === 409,
    );
    const rerun = await importRepository({ kind: 'local', path: source }, store);
    assert.equal(rerun.id, before.id);
    assert.equal(rerun.learning.notes, 'Costo por unidad');
    await writeFile(
      path.join(source, 'price.ts'),
      'export function total(units: number) { return units * 300; }',
    );
    const after = await importRepository({ kind: 'local', path: source }, store);
    assert.notEqual(after.id, before.id);
    assert.equal(after.projectId, before.projectId);
    assert.equal(store.file(before.id, 'price.ts')!.text.includes('250'), true);
    assert.equal(store.revisions(before.projectId).length, 2);
    store.close();
    store = new Store(data);
    assert.equal(store.snapshot(before.id)!.learning.notes, 'Costo por unidad');
    const copy = store.export(before.id);
    const alternate = new Store(path.join(root, 'restored'));
    try {
      const restored = alternate.restore(copy);
      assert.equal(restored.learning.notes, 'Costo por unidad');
      for (const invalidCoverage of [
        { ...copy.snapshot.coverage, limitations: [{ invalid: 'not renderable' }] },
        { ...copy.snapshot.coverage, indexed: -1 },
        { ...copy.snapshot.coverage, skipped: 0.5 },
      ]) {
        const malformed = structuredClone(copy);
        malformed.snapshot.coverage = invalidCoverage as typeof malformed.snapshot.coverage;
        assert.throws(() => alternate.restore(malformed), /cobertura/);
      }
      for (const analysis of [
        {},
        { ...copy.snapshot.graph.analysis, limitations: [null] },
        { ...copy.snapshot.graph.analysis, parsedFiles: -1 },
      ]) {
        const malformed = structuredClone(copy);
        malformed.snapshot.graph.analysis = analysis as typeof malformed.snapshot.graph.analysis;
        assert.throws(() => alternate.restore(malformed), /cobertura del análisis/);
      }
      const ungrounded = structuredClone(copy);
      ungrounded.snapshot.learning.sessions = [
        {
          id: 'unsupported',
          question: 'What does this code guarantee?',
          createdAt: new Date().toISOString(),
          answer: {
            summary: 'Unsupported statement',
            claims: [{ text: 'A fabricated guarantee.', status: 'source', sources: [] }],
            nextQuestion: 'Why?',
          },
        },
      ];
      assert.throws(() => alternate.restore(ungrounded), /afirmación/);
      const malicious = structuredClone(copy);
      malicious.files[0].path = '../escape';
      assert.throws(() => alternate.restore(malicious));
      const forged = structuredClone(copy);
      forged.snapshot.id = 'different';
      forged.snapshot.plan.features[0].sources[0].excerpt = 'not in the file';
      assert.throws(() => alternate.restore(forged));
    } finally {
      alternate.close();
    }
    store.deleteProject(before.projectId);
    assert.equal(store.snapshot(before.id), null);
    assert.equal(store.snapshot(after.id), null);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('HTTP access rejects cross-origin and unauthenticated browser requests, exports and updates supported', async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), 'trama-http-'));
  const store = new Store(folder);
  const app = createApp(store),
    server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const url = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const headers = { 'X-Trama-Request': '1', 'Content-Type': 'application/json' };
  try {
    assert.equal((await fetch(url + '/api/projects')).status, 403);
    assert.equal(
      (
        await fetch(url + '/api/projects', {
          headers: { ...headers, Origin: 'https://evil.example' },
        })
      ).status,
      403,
    );
    const foreignHost = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        url + '/api/projects',
        { headers: { ...headers, Host: 'evil.example' } },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(foreignHost, 403);
    const health = await fetch(url + '/api/health', { headers });
    assert.equal(health.status, 200);
    const response = await fetch(url + '/api/import', {
      method: 'POST',
      headers,
      body: JSON.stringify({ kind: 'example', example: 'pedidos' }),
    });
    assert.equal(response.status, 202);
    const job = (await response.json()) as { jobId: string };
    let state: { status: string; snapshotId?: string; error?: string } = { status: 'running' };
    for (let i = 0; i < 100 && state.status === 'running'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      state = (await (
        await fetch(url + '/api/jobs/' + job.jobId, { headers })
      ).json()) as typeof state;
    }
    assert.equal(state.status, 'complete', state.error);
    const id = state.snapshotId!;
    const escaped = await fetch(
      url + '/api/snapshots/' + id + '/file?path=' + encodeURIComponent('../../.env'),
      { headers },
    );
    assert.equal(escaped.status, 404);
    const search = await fetch(url + '/api/snapshots/' + id + '/search?q=pedido', { headers });
    assert.equal(search.status, 200);
    assert(((await search.json()) as { matches: unknown[] }).matches.length > 0);
    const update = await fetch(url + '/api/snapshots/' + id + '/learning', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ value: { notes: 'Nueva nota' }, version: 0 }),
    });
    assert.equal(update.status, 200);
    assert.equal(
      (
        await fetch(url + '/api/snapshots/' + id + '/learning', {
          method: 'PUT',
          headers,
          body: JSON.stringify({ value: { notes: 'vieja' }, version: 0 }),
        })
      ).status,
      409,
    );
    const exported = await fetch(url + '/api/snapshots/' + id + '/export', { headers });
    assert.equal(exported.status, 200);
    assert.equal(
      ((await exported.json()) as { snapshot: { learning: { notes: string } } }).snapshot.learning
        .notes,
      'Nueva nota',
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    store.close();
    await rm(folder, { recursive: true, force: true });
  }
});
