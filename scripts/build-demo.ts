/** The public demo is generated exclusively from the two checked-in examples. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store, hash } from '../server/database.js';
import { importRepository } from '../server/repository.js';
import { buildExercises } from '../server/learning.js';
import type { Snapshot } from '../shared/types.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ids = ['pedidos', 'data-pipeline'] as const;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'trama-public-examples-'));
const store = new Store(temporary);
const originalDirectory = process.cwd();
process.chdir(root);
try {
  const bundles = [];
  for (const id of ids) {
    const captured = await importRepository({ kind: 'example', example: id }, store);
    const files = store.files(captured.id);
    const location = 'examples/' + id;
    const revision = hash(files.map((file) => file.path + '\0' + file.hash).join('\n'));
    const projectId = hash('example|' + location).slice(0, 24);
    const snapshotId = hash(
      projectId +
        '|' +
        revision +
        '|' +
        files.map((file) => file.path + '\0' + file.hash).join('\n'),
    ).slice(0, 32);
    const snapshot: Snapshot = {
      ...captured,
      id: snapshotId,
      projectId,
      location,
      revision,
      createdAt: '2026-11-14T00:00:00.000Z',
      learning: {},
      learningVersion: 0,
    };
    const exercises = buildExercises(snapshot, files);
    if (!exercises.length)
      throw new Error('The public example ' + id + ' must have usable practice.');
    bundles.push({ snapshot, files, exercises });
  }
  const encoded = JSON.stringify(bundles);
  if (
    encoded.includes(root) ||
    encoded.includes(temporary) ||
    /(?:\/Users\/|[A-Z]:\\\\Users\\\\)/.test(encoded)
  )
    throw new Error('A machine-specific path appeared in the public examples.');
  await mkdir(path.join(root, 'public'), { recursive: true });
  await writeFile(path.join(root, 'public', 'examples.json'), encoded + '\n');
  console.log(
    'Generated ' +
      bundles.length +
      ' public examples with ' +
      bundles.reduce((total, bundle) => total + bundle.exercises.length, 0) +
      ' exercises.',
  );
} finally {
  process.chdir(originalDirectory);
  store.close();
  await rm(temporary, { recursive: true, force: true });
}
