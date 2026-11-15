import test from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import type { Graph, SourceFile } from '../shared/types.js';
import { projectGraph } from '../shared/graph.js';
import { buildGraph } from '../server/graph.js';

function graph(paths: string[], relations: [string, string, string?][] = []): Graph {
  return {
    nodes: paths.map((path) => ({
      id: path,
      path,
      label: path.split('/').at(-1)!,
      kind: 'module',
      symbols: [],
    })),
    edges: relations.map(([source, target, kind], i) => ({
      id: String(i),
      source,
      target,
      kind: kind || 'import',
      line: i + 1,
    })),
  };
}

test('directory projection aggregates dependency declarations while retaining original evidence', () => {
  const captured = graph(
    ['api/route.ts', 'api/auth.ts', 'domain/order.ts', 'domain/price.ts', 'README.md'],
    [
      ['api/route.ts', 'domain/order.ts'],
      ['api/route.ts', 'domain/price.ts'],
      ['api/auth.ts', 'domain/order.ts', 'python-import-candidate'],
      ['domain/order.ts', 'domain/price.ts'],
    ],
  );
  const overview = projectGraph(captured);
  assert.equal(overview.mode, 'overview');
  assert.deepEqual(overview.nodes.map((n) => n.path).sort(), ['README.md', 'api', 'domain']);
  assert.equal(overview.nodes.find((n) => n.path === 'domain')?.fileCount, 2);
  assert.equal(overview.edges.length, 1);
  assert.equal(overview.edges[0].count, 3);
  assert.deepEqual(overview.edges[0].kinds, ['import', 'python-import-candidate']);
  assert.deepEqual(
    overview.edges[0].evidence.map((edge) => edge.line),
    [1, 2, 3],
  );
  assert.equal(overview.graphEdges, 4);
  assert.equal(overview.collapsedEdges, 1);
  assert.equal(overview.nodes.find((n) => n.path === 'domain')?.internalEdges, 1);
  assert.equal(overview.hiddenEdges, 0);
  assert.equal(overview.displayedFiles, 5);
  const drilled = projectGraph(captured, { scope: 'api' });
  assert.equal(drilled.mode, 'directory');
  assert.equal(drilled.matchedFiles, 2);
  assert.equal(drilled.nodes.find((n) => n.path === 'domain')?.external, true);
  assert.equal(
    drilled.edges.reduce((sum, edge) => sum + edge.count, 0),
    3,
  );
  assert.deepEqual(
    drilled.breadcrumbs.map((entry) => entry.path),
    ['', 'api'],
  );
});

test('every file remains reachable through deterministic pages, including isolated and late files', () => {
  const captured = graph(
    Array.from({ length: 215 }, (_, index) => 'file-' + String(index).padStart(3, '0') + '.ts'),
  );
  const first = projectGraph(captured, { maxNodes: 40 });
  assert.equal(first.pageCount, 6);
  assert.equal(first.hiddenNodes, 175);
  const ids = new Set<string>();
  for (let page = 0; page < first.pageCount; page++)
    for (const node of projectGraph(captured, { maxNodes: 40, page }).nodes) ids.add(node.id);
  assert.equal(ids.size, captured.nodes.length);
  assert.equal(projectGraph(captured, { query: 'file-214' }).nodes[0].id, 'file-214.ts');
  assert.deepEqual(
    projectGraph({ ...captured, nodes: [...captured.nodes].reverse() }).nodes,
    first.nodes,
  );
  assert.equal(projectGraph(captured, { page: 9999 }).page, 5);
});

test('neighborhood direction and depth follow captured dependencies through cycles without inventing edges', () => {
  const captured = graph(
    ['a.ts', 'b.ts', 'c.ts', 'd.ts', 'unrelated.ts'],
    [
      ['a.ts', 'b.ts'],
      ['b.ts', 'c.ts'],
      ['d.ts', 'a.ts'],
      ['c.ts', 'a.ts'],
    ],
  );
  const paths = (options: Parameters<typeof projectGraph>[1]) =>
    projectGraph(captured, options)
      .nodes.map((node) => node.id)
      .sort();
  assert.deepEqual(paths({ focus: 'a.ts', direction: 'dependencies', hops: 1 }), ['a.ts', 'b.ts']);
  assert.deepEqual(paths({ focus: 'a.ts', direction: 'dependencies', hops: 2 }), [
    'a.ts',
    'b.ts',
    'c.ts',
  ]);
  assert.deepEqual(paths({ focus: 'a.ts', direction: 'dependents', hops: 1 }), [
    'a.ts',
    'c.ts',
    'd.ts',
  ]);
  assert.deepEqual(paths({ focus: 'a.ts', direction: 'both', hops: 2 }), [
    'a.ts',
    'b.ts',
    'c.ts',
    'd.ts',
  ]);
  assert.equal(projectGraph(captured, { focus: 'unrelated.ts' }).nodes.length, 1);
});

test('feature source scope is explicit and a file neighborhood can expand beyond that collection', () => {
  const captured = graph(
    ['src/a.ts', 'src/b.ts', 'other/c.ts'],
    [
      ['src/a.ts', 'src/b.ts'],
      ['other/c.ts', 'src/a.ts'],
    ],
  );
  const feature = projectGraph(captured, {
    fileIds: ['src/a.ts', 'src/b.ts', 'missing.ts'],
    scope: 'src',
  });
  assert.equal(feature.graphFiles, 3);
  assert.equal(feature.matchedFiles, 2);
  assert.deepEqual(feature.nodes.map((node) => node.id).sort(), ['src/a.ts', 'src/b.ts']);
  assert.equal(feature.edges.length, 1);
  assert.equal(projectGraph(captured, { fileIds: ['src/a.ts'], query: 'c.ts' }).nodes.length, 0);
  assert.equal(
    projectGraph(captured, { fileIds: ['src/a.ts'], focus: 'src/a.ts' }).nodes.length,
    3,
  );
});

test('projection bounds connections and evidence samples without making missing relations look complete', () => {
  const paths = Array.from(
    { length: 12 },
    (_, index) => 'group' + (index % 2) + '/file' + index + '.ts',
  );
  const relations: [string, string][] = [];
  for (const source of paths)
    for (const target of paths) if (source !== target) relations.push([source, target]);
  const captured = graph(paths, relations);
  const root = projectGraph(captured);
  assert.equal(root.edges[0].count, 36);
  assert.equal(root.edges[0].evidence.length, 5);
  const files = projectGraph(captured, { query: 'file', maxEdges: 10 });
  assert.equal(files.edges.length, 10);
  assert.equal(files.totalEdges, 132);
  assert.equal(files.hiddenEdges, 122);
  const withDangling = {
    ...captured,
    edges: [
      ...captured.edges,
      { id: 'bad', source: 'missing.ts', target: paths[0], kind: 'import', line: 1 },
    ],
  };
  assert.equal(projectGraph(withDangling).graphEdges, captured.edges.length);
  // File paths can contain a colon; directory IDs must not merge such a file with a folder.
  assert.equal(projectGraph(graph(['dir:src', 'src/a.ts'])).nodes.length, 2);
});

test('capture metadata distinguishes resolved syntax, Python candidates and unavailable resolution context', () => {
  const file = (path: string, text: string): SourceFile => ({ path, text, size: text.length });
  const captured = buildGraph([
    file(
      'main.ts',
      'import { x } from "./lib.mjs";\nimport "./excluded";\nimport "@app/config";\nimport(name);\nrequire(value);',
    ),
    file('lib.mts', 'export const x = 1;'),
    file('consumer.py', 'from worker import run\nfrom .missing import value'),
    file('worker.py', 'def run():\n  return 1'),
    file('README.md', '# Documentation'),
  ]);
  assert.ok(
    captured.edges.some(
      (edge) => edge.source === 'main.ts' && edge.target === 'lib.mts' && edge.line === 1,
    ),
  );
  assert.ok(captured.edges.some((edge) => edge.kind === 'python-import-candidate'));
  assert.deepEqual(captured.analysis && { ...captured.analysis, limitations: [] }, {
    version: 1,
    parsedFiles: 2,
    candidateFiles: 2,
    otherFiles: 1,
    unresolvedLocalImports: 2,
    externalImports: 1,
    dynamicImports: 2,
    limitations: [],
  });
  assert.ok(captured.analysis!.limitations.some((text) => text.includes('alias')));
  assert.ok(captured.analysis!.limitations.some((text) => text.includes('ejecución')));
});

test('4000-file capture stays bounded while global search and expansion reach the whole snapshot', (context) => {
  const paths = Array.from(
    { length: 4000 },
    (_, index) => `packages/module-${index % 40}/file-${String(index).padStart(4, '0')}.ts`,
  );
  const relations: [string, string][] = [];
  for (let index = 0; index < paths.length; index++)
    for (let offset = 1; offset <= 6; offset++)
      relations.push([paths[index], paths[(index + offset * 41) % paths.length]]);
  const captured = graph(paths, relations);
  const start = performance.now();
  const overview = projectGraph(captured);
  const modules = projectGraph(captured, { scope: 'packages' });
  const late = projectGraph(captured, { query: 'file-3999.ts' });
  const neighborhood = projectGraph(captured, { focus: paths.at(-1)!, hops: 2, maxNodes: 10 });
  const elapsed = performance.now() - start;
  assert.equal(overview.displayedFiles, 4000);
  assert.equal(overview.nodes.length, 1);
  assert.equal(overview.edges.length, 0);
  assert.equal(overview.collapsedEdges, 24000);
  assert.equal(modules.nodes.length, 40);
  assert.equal(modules.displayedFiles, 4000);
  assert.equal(late.nodes[0].path, paths.at(-1));
  assert.ok(neighborhood.nodes.length <= 40);
  assert.ok(neighborhood.edges.length <= 120);
  assert.ok(neighborhood.totalNodes > neighborhood.nodes.length);
  assert.equal(neighborhood.graphEdges, 24000);
  context.diagnostic(
    `4000 files / 24000 dependencies; four bounded projections: ${elapsed.toFixed(1)} ms on this test machine.`,
  );
});

test('every large-hub neighborhood page retains its anchor and the visible dependencies', () => {
  const leaves = Array.from({ length: 60 }, (_, index) => `leaf-${index}.ts`);
  const captured = graph(
    ['hub.ts', ...leaves],
    leaves.map((leaf) => ['hub.ts', leaf]),
  );
  const first = projectGraph(captured, { focus: 'hub.ts', maxNodes: 24 });
  assert.equal(first.pageCount, 3);
  const reached = new Set<string>();
  for (let page = 0; page < first.pageCount; page++) {
    const view = projectGraph(captured, { focus: 'hub.ts', maxNodes: 24, page });
    assert.equal(view.nodes[0].id, 'hub.ts');
    assert.ok(view.nodes.length <= 24);
    assert.equal(view.edges.length, view.nodes.length - 1);
    for (const node of view.nodes) reached.add(node.id);
  }
  assert.equal(reached.size, 61);
  const minimum = projectGraph(captured, { focus: 'hub.ts', maxNodes: 1, page: 59 });
  assert.equal(minimum.nodes.length, 2);
  assert.equal(minimum.edges.length, 1);
  assert.equal(minimum.pageCount, 60);
});
