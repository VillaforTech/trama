import test from 'node:test';
import assert from 'node:assert/strict';
import { readGithub } from '../server/repository.js';
import { AppError } from '../server/database.js';

test('authenticated GitHub indexing stays on official API, preserves pinned URLs and never emits credential', async () => {
  const fetchOriginal = globalThis.fetch,
    requests: string[] = [];
  const token = 'credential-only-for-test',
    sha = 'a'.repeat(40),
    tree = 'b'.repeat(40),
    blob = 'c'.repeat(40);
  try {
    globalThis.fetch = async (input, init) => {
      const url = String(input);
      requests.push(url);
      assert.equal(new URL(url).origin, 'https://api.github.com');
      assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer ' + token);
      assert.equal(init?.redirect, 'error');
      let body: unknown;
      if (url.endsWith('/repos/team/private'))
        body = {
          name: 'private',
          full_name: 'team/private',
          default_branch: 'main',
          private: true,
        };
      else if (url.includes('/commits/')) body = { sha, commit: { tree: { sha: tree } } };
      else if (url.includes('/git/trees/'))
        body = {
          tree: [
            { path: 'index.ts', type: 'blob', mode: '100644', sha: blob, size: 70 },
            { path: '.env', type: 'blob', mode: '100644', sha: blob, size: 20 },
            { path: 'linked.ts', type: 'blob', mode: '120000', sha: blob, size: 20 },
          ],
        };
      else if (url.includes('/git/blobs/'))
        return new Response('export function total(units: number) { return units * 250; }');
      else throw new Error('unexpected request');
      return new Response(JSON.stringify(body), {
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const updates: unknown[] = [];
    const record = await readGithub('team/private', token, (...args) => updates.push(args));
    assert.equal(record.files.length, 1);
    assert.equal(record.files[0].url, 'https://github.com/team/private/blob/' + sha + '/index.ts');
    assert(!JSON.stringify(record).includes(token));
    assert(!JSON.stringify(updates).includes(token));
    assert.equal(requests.length, 4);
  } finally {
    globalThis.fetch = fetchOriginal;
  }
});

test('GitHub permission errors explain unavailable access without reflecting upstream secrets', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('sensitive upstream failure', { status: 401 });
    await assert.rejects(
      readGithub('team/private', 'test-credential'),
      (error: unknown) =>
        error instanceof AppError &&
        error.status === 401 &&
        !error.message.includes('sensitive') &&
        !error.message.includes('test-credential'),
    );
  } finally {
    globalThis.fetch = original;
  }
});
