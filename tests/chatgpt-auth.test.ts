import test from 'node:test';
import assert from 'node:assert/strict';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { ChatGPTAuth, type SignInOptions } from '../server/chatgpt-auth.js';
import { readLocal } from '../server/repository.js';

const keys = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(keys.publicKey)), kid: 'fixture-key', alg: 'RS256', use: 'sig' };
const CLIENT = 'oaiapp_trama_fixture';
const ISSUER = 'https://auth.openai.com';
const DIRECT_SCOPE =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((ok) => {
    resolve = ok;
  });
  return { promise, resolve };
}
async function begin(auth: ChatGPTAuth, options?: SignInOptions) {
  const done = auth.start(options);
  void done.catch(() => undefined);
  for (let i = 0; i < 200; i++) {
    const status = await auth.status();
    if (status.authUrl) return { url: new URL(status.authUrl), done };
    if (status.phase === 'error') await done;
    await delay(5);
  }
  throw new Error('Fixture authorization listener did not start');
}
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'trama-auth-test-'));
  const key = randomBytes(32);
  let now = Date.now();
  let authorization: URL;
  let refreshCount = 0;
  let tokenCount = 0;
  let identityOverride: Record<string, unknown> = {};
  let identityOnly = false;
  let tokenFailure: string | undefined;
  let jwksUnavailable = false;
  let revokeFailure = false;
  let omitRefreshIdentity = false;
  let encryptHook: ((value: string) => Promise<void>) | undefined;
  const tokenForms: URLSearchParams[] = [];
  const revocations: URLSearchParams[] = [];
  const secret = async (operation: 'available' | 'encrypt' | 'decrypt', value = '') => {
    if (operation === 'available') return 'available';
    if (operation === 'encrypt') {
      await encryptHook?.(value);
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
    }
    const bytes = Buffer.from(value, 'base64');
    const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8');
  };
  const signIdentity = async () =>
    new SignJWT({
      nonce: authorization.searchParams.get('nonce'),
      email: 'fixture@example.test',
      ...identityOverride,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'fixture-key' })
      .setIssuer(typeof identityOverride.iss === 'string' ? identityOverride.iss : ISSUER)
      .setAudience((identityOverride.aud as string | string[]) ?? CLIENT)
      .setSubject(
        typeof identityOverride.sub === 'string' ? identityOverride.sub : 'subject-fixture',
      )
      .setIssuedAt(Math.floor(now / 1000))
      .setExpirationTime(
        typeof identityOverride.exp === 'number'
          ? identityOverride.exp
          : Math.floor(now / 1000) + 3600,
      )
      .sign(keys.privateKey);
  const transport: typeof fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    assert.equal(new URL(url).origin, ISSUER, 'Tokens are sent only to the fixed OpenAI issuer');
    assert.equal(init?.redirect, 'error');
    if (url.endsWith('/.well-known/jwks.json')) {
      if (jwksUnavailable) throw new TypeError('fixture network failure');
      return Response.json({ keys: [jwk] });
    }
    if (url.endsWith('/.well-known/openid-configuration'))
      return Response.json({
        issuer: ISSUER,
        revocation_endpoint: ISSUER + '/api/accounts/oauth/revoke',
      });
    const form = new URLSearchParams(init?.body as URLSearchParams);
    if (url.endsWith('/oauth/revoke')) {
      revocations.push(form);
      return new Response('', { status: revokeFailure ? 503 : 200 });
    }
    assert.equal(url, ISSUER + '/api/accounts/oauth/token');
    tokenForms.push(form);
    tokenCount++;
    if (tokenFailure)
      return Response.json(
        { error: tokenFailure, error_description: 'SECRET must never be surfaced' },
        { status: 400 },
      );
    assert.equal(form.get('client_id'), CLIENT);
    assert.equal(form.get('resource'), 'https://api.openai.com/v1');
    if (form.get('grant_type') === 'authorization_code') {
      assert.equal(form.get('redirect_uri'), authorization.searchParams.get('redirect_uri'));
      assert.equal(
        createHash('sha256').update(form.get('code_verifier')!).digest('base64url'),
        authorization.searchParams.get('code_challenge'),
      );
    } else {
      assert.equal(form.get('grant_type'), 'refresh_token');
      assert(!form.has('scope'));
      refreshCount++;
    }
    return Response.json(
      identityOnly
        ? {
            id_token: await signIdentity(),
            scope: 'openid profile email',
          }
        : {
            access_token: 'access-fixture-' + refreshCount,
            refresh_token: 'refresh-fixture-' + refreshCount,
            ...(omitRefreshIdentity && form.get('grant_type') === 'refresh_token'
              ? {}
              : { id_token: await signIdentity() }),
            token_type: 'Bearer',
            expires_in: 3600,
            scope: DIRECT_SCOPE,
          },
    );
  };
  const create = () =>
    new ChatGPTAuth(directory, {
      fetch: transport,
      secret,
      now: () => now,
      authorizationTimeoutMs: 10000,
    });
  const auth = create();
  const start = async (instance = auth, options?: SignInOptions) => {
    const pending = await begin(instance, options);
    authorization = pending.url;
    return pending;
  };
  const callback = async (
    pending: Awaited<ReturnType<typeof begin>>,
    overrides: Record<string, string> = {},
  ) => {
    const url = new URL(pending.url.searchParams.get('redirect_uri')!);
    url.searchParams.set('state', pending.url.searchParams.get('state')!);
    url.searchParams.set('code', 'code-fixture');
    url.searchParams.set('client_id', CLIENT);
    for (const [key, value] of Object.entries(overrides)) url.searchParams.set(key, value);
    return fetch(url);
  };
  const connect = async () => {
    const pending = await start();
    assert.equal((await callback(pending)).status, 200);
    await pending.done;
    return (await auth.status()).profileId!;
  };
  const readState = async () =>
    JSON.parse(
      await secret(
        'decrypt',
        JSON.parse(await readFile(join(directory, 'chatgpt-auth.json'), 'utf8')).data,
      ),
    );
  return {
    auth,
    create,
    directory,
    secret,
    start,
    callback,
    connect,
    readState,
    advance: (ms: number) => {
      now += ms;
    },
    overrideIdentity: (value: Record<string, unknown>) => {
      identityOverride = value;
    },
    identityOnly: () => {
      identityOnly = true;
    },
    failToken: (code?: string) => {
      tokenFailure = code;
    },
    failJWKS: (value: boolean) => {
      jwksUnavailable = value;
    },
    failRevoke: () => {
      revokeFailure = true;
    },
    omitRefreshIdentity: () => {
      omitRefreshIdentity = true;
    },
    onEncrypt: (hook?: (value: string) => Promise<void>) => {
      encryptHook = hook;
    },
    refreshCount: () => refreshCount,
    tokenCount: () => tokenCount,
    tokenForms,
    revocations,
    cleanup: async () => {
      auth.cancel();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

test('OAuth binds PKCE, state and nonce; stores encrypted credentials; preserves registration on logout', async () => {
  const f = await fixture();
  try {
    const pending = await f.start();
    assert.equal(pending.url.origin, ISSUER);
    assert.equal(pending.url.searchParams.get('client_id'), 'dynamic_agent_client');
    assert.equal(pending.url.searchParams.get('agent_name_hint'), 'Trama');
    assert(!pending.url.searchParams.has('id_token_hint'));
    const host = pending.url.searchParams.get('ext_agent_host_id');
    assert.equal((await f.callback(pending, { state: 'wrong-state' })).status, 400);
    assert.equal(f.tokenCount(), 0);
    const duplicate = new URL(pending.url.searchParams.get('redirect_uri')!);
    duplicate.search = new URLSearchParams({
      state: pending.url.searchParams.get('state')!,
      code: 'x',
      client_id: CLIENT,
    }).toString();
    duplicate.searchParams.append('state', 'another');
    assert.equal((await fetch(duplicate)).status, 400);
    assert.equal((await f.callback(pending)).status, 200);
    await pending.done;
    const status = await f.auth.status();
    assert.equal(status.connected, true);
    assert.equal(status.sharing, true);
    assert.equal(status.storage, 'encrypted');
    assert(!JSON.stringify(status).includes('access-fixture'));
    const disk = await readFile(join(f.directory, 'chatgpt-auth.json'), 'utf8');
    assert(!disk.includes('fixture@example.test'));
    assert(!disk.includes('refresh-fixture'));
    assert.equal((await stat(join(f.directory, 'chatgpt-auth.json'))).mode & 0o777, 0o600);
    await assert.rejects(f.callback(pending), /fetch failed/);
    await f.auth.disconnect();
    assert.equal((await f.auth.status()).connected, false);
    assert.equal(f.revocations[0].get('token'), 'refresh-fixture-0');
    const returning = await f.start();
    assert.equal(returning.url.searchParams.get('client_id'), CLIENT);
    assert.equal(returning.url.searchParams.get('ext_agent_host_id'), host);
    assert(!returning.url.searchParams.has('agent_name_hint'));
    f.auth.cancel();
    await returning.done;
  } finally {
    await f.cleanup();
  }
});

test('rejects JWT nonce/audience/authorized-party mismatches and retains the issued client before exchange', async () => {
  for (const identity of [
    { nonce: 'wrong' },
    { aud: 'wrong-client' },
    { aud: [CLIENT, 'other-client'] },
    { azp: 'other-client' },
    { exp: Math.floor(Date.now() / 1000) - 60 },
    { iss: 'https://untrusted.example' },
  ]) {
    const f = await fixture();
    try {
      f.overrideIdentity(identity);
      const pending = await f.start();
      assert.equal((await f.callback(pending)).status, 400);
      await assert.rejects(
        pending.done,
        (cause: unknown) => (cause as { code: string }).code === 'chatgpt_invalid_identity',
      );
      const state = await f.readState();
      assert.equal(state.profiles[0].clientId, CLIENT);
      assert.equal(state.profiles[0].credentials, undefined);
      assert.equal((await f.auth.status()).connected, false);
    } finally {
      await f.cleanup();
    }
  }
});

test('reauthorization rejects replacement client IDs or identities without overwriting the active account', async () => {
  const f = await fixture();
  try {
    const id = await f.connect();
    const changedClient = await f.start();
    assert.equal((await f.callback(changedClient, { client_id: 'oaiapp_different' })).status, 400);
    await assert.rejects(
      changedClient.done,
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_invalid_client',
    );
    f.overrideIdentity({ sub: 'different-subject' });
    const changedIdentity = await f.start();
    assert.equal((await f.callback(changedIdentity)).status, 400);
    await assert.rejects(
      changedIdentity.done,
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_identity_mismatch',
    );
    const status = await f.auth.status();
    assert.equal(status.connected, true);
    assert.equal(status.profileId, id);
    assert.equal((await f.readState()).profiles[0].subject, 'subject-fixture');
  } finally {
    await f.cleanup();
  }
});

test('retains identity-only sign-in and prevents inference without ChatGPT plan permission', async () => {
  const f = await fixture();
  try {
    f.identityOnly();
    const id = await f.connect();
    const status = await f.auth.status();
    assert.equal(status.connected, true);
    assert.equal(status.sharing, false);
    await assert.rejects(
      f.auth.withAccess(id, async () => assert.fail('Inference must not run')),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_sharing_disabled',
    );
  } finally {
    await f.cleanup();
  }
});

test('serializes rotating refreshes across instances and rejects a changed selected account', async () => {
  const f = await fixture();
  try {
    const id = await f.connect();
    f.advance(3590_000);
    const other = f.create();
    const tokens = await Promise.all([
      f.auth.withAccess(id, async (token) => token),
      other.withAccess(id, async (token) => token),
    ]);
    assert.deepEqual(tokens, ['access-fixture-1', 'access-fixture-1']);
    assert.equal(f.refreshCount(), 1);
    await assert.rejects(
      f.auth.withAccess('different-profile', async () => assert.fail()),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_profile_changed',
    );
  } finally {
    await f.cleanup();
  }
});

test('retains rotated credentials while JWKS is unavailable and verifies them before retrying inference', async () => {
  const f = await fixture();
  try {
    const id = await f.connect();
    f.advance(3590_000);
    f.failJWKS(true);
    const other = f.create();
    await assert.rejects(
      other.withAccess(id, async () => assert.fail('Unverified rotated token must not be used')),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_identity_unavailable',
    );
    const state = await f.readState();
    assert.equal(state.profiles[0].pendingCredentials.refreshToken, 'refresh-fixture-1');
    assert.equal(f.refreshCount(), 1);
    f.failJWKS(false);
    assert.equal(await other.withAccess(id, async (token) => token), 'access-fixture-1');
    assert.equal(f.refreshCount(), 1);
    assert.equal((await f.readState()).profiles[0].pendingCredentials, undefined);
  } finally {
    await f.cleanup();
  }
});

test('refresh can retain an already validated ID token after its identity-hint expiry', async () => {
  const f = await fixture();
  try {
    const id = await f.connect();
    f.advance(3700_000);
    f.omitRefreshIdentity();
    assert.equal(await f.auth.withAccess(id, async (token) => token), 'access-fixture-1');
    assert.equal((await f.auth.status()).connected, true);
  } finally {
    await f.cleanup();
  }
});

test('clears terminal refresh failures while preserving host and issued registration', async () => {
  for (const code of [
    'invalid_grant',
    'invalid_refresh_token',
    'token_expired',
    'refresh_token_expired',
    'refresh_token_invalidated',
    'refresh_token_reused',
  ]) {
    const f = await fixture();
    try {
      const id = await f.connect();
      f.advance(3590_000);
      f.failToken(code);
      await assert.rejects(
        f.auth.withAccess(id, async () => assert.fail()),
        (cause: unknown) =>
          (cause as { code: string }).code === 'chatgpt_reauthentication_required',
      );
      assert.equal((await f.auth.status()).connected, false);
      const state = await f.readState();
      assert.equal(state.profiles[0].clientId, CLIENT);
      assert(state.hostId.startsWith('urn:uuid:'));
      assert(!JSON.stringify(await f.auth.status()).includes('SECRET'));
    } finally {
      await f.cleanup();
    }
  }
});

test('cancellation before secure-storage readiness cannot open a late authorization attempt', async () => {
  const f = await fixture(),
    gate = deferred();
  try {
    const auth = new ChatGPTAuth(f.directory, {
      secret: async (op, value) => {
        if (op === 'available') await gate.promise;
        return f.secret(op, value);
      },
    });
    const done = auth.start();
    auth.cancel();
    gate.resolve();
    await done;
    assert.equal((await auth.status()).phase, 'idle');
    assert.equal((await auth.status()).authUrl, undefined);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});

test('cancellation during encrypted credential commit cannot leave a connected account', async () => {
  const f = await fixture(),
    entered = deferred(),
    gate = deferred();
  try {
    f.onEncrypt(async (value) => {
      if (value.includes('access-fixture')) {
        entered.resolve();
        await gate.promise;
      }
    });
    const pending = await f.start();
    const callback = f.callback(pending).catch(() => undefined);
    await entered.promise;
    f.auth.cancel();
    gate.resolve();
    await pending.done;
    await callback;
    for (let i = 0; i < 100; i++) {
      if (!(await f.readState()).activeId) break;
      await delay(5);
    }
    assert.equal((await f.auth.status()).connected, false);
    assert.equal((await f.readState()).profiles[0].credentials, undefined);
  } finally {
    gate.resolve();
    await f.cleanup();
  }
});

test('disconnect aborts in-flight inference and reports unconfirmed remote revocation without retaining tokens', async () => {
  const f = await fixture(),
    entered = deferred();
  try {
    const id = await f.connect();
    const inference = f.auth.withAccess(id, async (_token, signal) => {
      entered.resolve();
      await delay(10000, undefined, { signal });
    });
    void inference.catch(() => undefined);
    await entered.promise;
    f.failRevoke();
    await f.auth.disconnect();
    await assert.rejects(inference, /abort/i);
    const status = await f.auth.status();
    assert.equal(status.connected, false);
    assert.equal(status.errorCode, 'chatgpt_revocation_unconfirmed');
    assert.equal((await f.readState()).profiles[0].credentials, undefined);
  } finally {
    await f.cleanup();
  }
});

test('credential storage is unavailable without the desktop bridge and credentials cannot enter source snapshots', async () => {
  const f = await fixture();
  try {
    const unavailable = new ChatGPTAuth(join(f.directory, 'server-only'));
    assert.equal((await unavailable.status()).available, false);
    await assert.rejects(unavailable.start(), /almacén/);
    await writeFile(join(f.directory, 'README.md'), '# Example');
    await writeFile(join(f.directory, 'chatgpt-auth.json.fixture.json'), '{"secret":"fixture"}');
    await writeFile(join(f.directory, 'chatgpt-preferences.json'), '{"model":"fixture"}');
    const indexed = await readLocal(f.directory);
    assert(indexed.files.some((file) => file.path === 'README.md'));
    assert(!indexed.files.some((file) => file.path.includes('chatgpt-')));
  } finally {
    await f.cleanup();
  }
});

test('constructing authentication never opens secure storage; first status initializes once', async () => {
  const f = await fixture();
  const calls: string[] = [];
  try {
    const auth = new ChatGPTAuth(f.directory, {
      secret: async (operation, value) => {
        calls.push(operation);
        return f.secret(operation, value);
      },
    });
    await delay(10);
    assert.deepEqual(calls, []);
    await assert.rejects(stat(join(f.directory, 'chatgpt-auth.json')), { code: 'ENOENT' });
    assert.equal((await auth.status()).storage, 'encrypted');
    assert.equal(calls.filter((operation) => operation === 'available').length, 1);
    await auth.status();
    assert.equal(calls.filter((operation) => operation === 'available').length, 1);
  } finally {
    await f.cleanup();
  }
});

test('unavailable storage remains fail-closed during polling and explicit start can retry', async () => {
  const f = await fixture();
  let available = false;
  let checks = 0;
  try {
    const auth = new ChatGPTAuth(f.directory, {
      secret: async (operation, value) => {
        if (operation === 'available') {
          checks++;
          if (!available) throw new Error('fixture permission unavailable');
        }
        return f.secret(operation, value);
      },
    });
    const failed = await auth.status();
    assert.equal(failed.available, false);
    assert.equal(failed.storage, 'unavailable');
    assert.equal(failed.errorCode, 'chatgpt_storage_unavailable');
    await assert.rejects(stat(join(f.directory, 'chatgpt-auth.json')), { code: 'ENOENT' });
    await auth.status();
    assert.equal(checks, 1, 'Status polling must not repeat the OS access request');
    await assert.rejects(
      auth.withAccess('missing', async () => assert.fail()),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_storage_unavailable',
    );
    available = true;
    const pending = await begin(auth);
    assert.equal(checks, 2);
    assert.equal((await auth.status()).storage, 'encrypted');
    auth.cancel();
    await pending.done;
    assert.equal((await auth.status()).phase, 'idle');
    assert.equal((await auth.status()).authUrl, undefined);
  } finally {
    await f.cleanup();
  }
});

test('a denied read of an existing encrypted account never replaces its ciphertext', async () => {
  const f = await fixture();
  try {
    const profileId = await f.connect();
    const authPath = join(f.directory, 'chatgpt-auth.json');
    const original = await readFile(authPath);
    let encryptCalls = 0;
    const locked = new ChatGPTAuth(f.directory, {
      secret: async (operation, value) => {
        if (operation === 'decrypt') throw new Error('fixture Keychain read denied');
        if (operation === 'encrypt') encryptCalls++;
        return f.secret(operation, value);
      },
    });
    const status = await locked.status();
    assert.equal(status.available, false);
    assert.equal(status.storage, 'unavailable');
    assert.equal(status.connected, false);
    assert.equal(status.errorCode, 'chatgpt_storage_unavailable');
    await assert.rejects(
      locked.withAccess(profileId, async () => assert.fail('Locked credentials must not be used')),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_storage_unavailable',
    );
    await assert.rejects(
      locked.start(),
      (cause: unknown) => (cause as { code: string }).code === 'chatgpt_storage_unavailable',
    );
    assert.equal(encryptCalls, 0);
    assert.deepEqual(await readFile(authPath), original);
  } finally {
    await f.cleanup();
  }
});
