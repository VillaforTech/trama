import type { Graph } from './types.js';

export type GraphDirection = 'both' | 'dependencies' | 'dependents';
export interface GraphProjectionOptions {
  scope?: string;
  /** Optional source files of a feature/process; an absent collection means the whole snapshot. */
  fileIds?: string[];
  focus?: string;
  direction?: GraphDirection;
  hops?: 1 | 2;
  query?: string;
  page?: number;
  maxNodes?: number;
  maxEdges?: number;
}
export interface ProjectedNode {
  id: string;
  label: string;
  path: string;
  kind: 'directory' | 'file';
  fileCount: number;
  external: boolean;
  symbols: string[];
  inbound: number;
  outbound: number;
  internalEdges: number;
}
export interface ProjectedEdge {
  id: string;
  source: string;
  target: string;
  /** Number of distinct captured dependencies represented by this connection. */
  count: number;
  kinds: string[];
  /** At most five original, locatable dependency declarations. */
  evidence: Graph['edges'];
}
export interface GraphProjection {
  nodes: ProjectedNode[];
  edges: ProjectedEdge[];
  mode: 'overview' | 'directory' | 'neighbors' | 'search';
  scope: string;
  focus: string;
  breadcrumbs: { label: string; path: string }[];
  page: number;
  pageCount: number;
  totalNodes: number;
  hiddenNodes: number;
  totalEdges: number;
  hiddenEdges: number;
  matchedFiles: number;
  displayedFiles: number;
  graphFiles: number;
  graphEdges: number;
  /** Captured dependencies kept inside collapsed directory nodes. */
  collapsedEdges: number;
}

const collate = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const basename = (value: string) => value.split('/').at(-1) || value;
const directoryId = (path: string) => 'dir:' + path;
const inScope = (path: string, scope: string) => !scope || path.startsWith(scope + '/');
const normalizeScope = (scope: string) =>
  scope
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
function bound(value: number | undefined, fallback: number, min: number, max: number) {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(min, Math.min(max, Math.floor(value)));
}
function breadcrumbs(scope: string) {
  return [{ label: 'Todo el repositorio', path: '' }].concat(
    scope
      .split('/')
      .filter(Boolean)
      .map((part, index, parts) => ({
        label: part,
        path: parts.slice(0, index + 1).join('/'),
      })),
  );
}

/**
 * Builds a bounded view of a captured graph without discarding the remaining graph.
 * Directory boundaries are navigation aids, not inferred architectural components.
 * Work is O(V + E log E + P log P), where P is the number of projected nodes/connections.
 * All paths and relations come from the immutable snapshot, never from executing code.
 */
export function projectGraph(graph: Graph, options: GraphProjectionOptions = {}): GraphProjection {
  const sourceNodes = new Map(graph.nodes.map((node) => [node.id, node]));
  // Ignore dangling relations in older or externally restored snapshots.
  const rawEdges = graph.edges
    .filter((edge) => sourceNodes.has(edge.source) && sourceNodes.has(edge.target))
    .sort((a, b) => collate(a.id, b.id));
  const scope = normalizeScope(options.scope || '');
  const focus = sourceNodes.has(options.focus || '') ? options.focus! : '';
  const query = (options.query || '').trim().toLocaleLowerCase();
  const mode = query ? 'search' : focus ? 'neighbors' : scope ? 'directory' : 'overview';
  // A neighborhood needs room for the anchor and at least one relation endpoint.
  const maxNodes = bound(options.maxNodes, 40, mode === 'neighbors' ? 2 : 1, 120);
  const maxEdges = bound(options.maxEdges, 120, 1, 400);
  const adjacency = new Map<string, Set<string>>();
  for (const edge of rawEdges) {
    if (options.direction !== 'dependents') {
      if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set());
      adjacency.get(edge.source)!.add(edge.target);
    }
    if (options.direction !== 'dependencies') {
      if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set());
      adjacency.get(edge.target)!.add(edge.source);
    }
  }
  const distance = new Map<string, number>();
  if (mode === 'neighbors') {
    distance.set(focus, 0);
    let frontier = [focus];
    for (let hop = 1; hop <= (options.hops === 2 ? 2 : 1); hop++) {
      const next: string[] = [];
      for (const from of frontier)
        for (const to of adjacency.get(from) || [])
          if (!distance.has(to)) {
            distance.set(to, hop);
            next.push(to);
          }
      frontier = next;
    }
  }
  const collection = options.fileIds ? new Set(options.fileIds) : null;
  const matches = [...sourceNodes.values()].filter((node) =>
    mode !== 'neighbors' && collection && !collection.has(node.id)
      ? false
      : mode === 'search'
        ? node.path.toLocaleLowerCase().includes(query) ||
          node.symbols.some((symbol) => symbol.toLocaleLowerCase().includes(query))
        : mode === 'neighbors'
          ? distance.has(node.id)
          : inScope(node.path, scope),
  );
  const members = new Map<string, Set<string>>();
  const projected = new Map<string, ProjectedNode>();
  const mapping = new Map<string, string>();
  function addFile(raw: Graph['nodes'][number], external = false) {
    let path = raw.path;
    let kind: ProjectedNode['kind'] = 'file';
    if (mode === 'overview' || mode === 'directory') {
      const remainder = external ? raw.path : raw.path.slice(scope ? scope.length + 1 : 0);
      const part = remainder.split('/')[0];
      if (remainder.includes('/')) {
        path = external ? part : [scope, part].filter(Boolean).join('/');
        kind = 'directory';
      }
    }
    let id = kind === 'directory' ? directoryId(path) : raw.id;
    if (kind === 'directory') while (sourceNodes.has(id)) id = 'dir:' + id;
    if (!projected.has(id)) {
      projected.set(id, {
        id,
        path,
        label: basename(path),
        kind,
        fileCount: 0,
        external,
        symbols: kind === 'file' ? raw.symbols : [],
        inbound: 0,
        outbound: 0,
        internalEdges: 0,
      });
      members.set(id, new Set());
    }
    members.get(id)!.add(raw.id);
    mapping.set(raw.id, id);
  }
  for (const node of matches) addFile(node);
  // A drilled directory retains the outside modules it connects to. Without these,
  // expanding a directory would misleadingly make its cross-module edges disappear.
  if (mode === 'directory' && !collection) {
    const internalIds = new Set(matches.map((node) => node.id));
    const externalIds = new Set<string>();
    for (const edge of rawEdges) {
      if (internalIds.has(edge.source) && !internalIds.has(edge.target))
        externalIds.add(edge.target);
      if (internalIds.has(edge.target) && !internalIds.has(edge.source))
        externalIds.add(edge.source);
    }
    for (const id of externalIds) addFile(sourceNodes.get(id)!, true);
  }
  const connections = new Map<string, ProjectedEdge>();
  let collapsedEdges = 0;
  for (const edge of rawEdges) {
    const from = mapping.get(edge.source),
      to = mapping.get(edge.target);
    if (!from || !to) continue;
    if (from === to) {
      projected.get(from)!.internalEdges++;
      collapsedEdges++;
      continue;
    }
    // Do not add connections solely between outside context groups.
    if (projected.get(from)!.external && projected.get(to)!.external) continue;
    const id = JSON.stringify([from, to]);
    let connection = connections.get(id);
    if (!connection) {
      connection = { id, source: from, target: to, count: 0, kinds: [], evidence: [] };
      connections.set(id, connection);
    }
    connection.count++;
    if (!connection.kinds.includes(edge.kind)) connection.kinds.push(edge.kind);
    if (connection.evidence.length < 5) connection.evidence.push(edge);
    projected.get(from)!.outbound++;
    projected.get(to)!.inbound++;
  }
  for (const node of projected.values()) node.fileCount = members.get(node.id)!.size;
  const ranked = [...projected.values()].sort((a, b) => {
    // Preserve breadth first distance in neighborhood mode; keep the chosen file
    // first so pagination never makes the initial view lose its reference point.
    if (mode === 'neighbors') {
      const depth = (distance.get(a.id) || 0) - (distance.get(b.id) || 0);
      if (depth) return depth;
    }
    if (mode === 'search') {
      const exact =
        Number(b.label.toLocaleLowerCase() === query) -
        Number(a.label.toLocaleLowerCase() === query);
      if (exact) return exact;
    }
    // Local content precedes outside context, then connected content precedes
    // isolated files. The complete deterministic list remains available by page.
    if (a.external !== b.external) return Number(a.external) - Number(b.external);
    const degree = b.inbound + b.outbound - a.inbound - a.outbound;
    return degree || collate(a.path, b.path);
  });
  // Keep the selected file on every neighborhood page. Otherwise a large hub's
  // later pages would consist of disconnected-looking leaves without their hub.
  const anchor = mode === 'neighbors' ? ranked.find((node) => node.id === focus) : undefined;
  const pageable = anchor ? ranked.filter((node) => node.id !== focus) : ranked;
  const pageSize = maxNodes - (anchor ? 1 : 0);
  const pageCount = Math.max(1, Math.ceil(pageable.length / pageSize));
  const page = Math.min(bound(options.page, 0, 0, Number.MAX_SAFE_INTEGER), pageCount - 1);
  const nodes = [
    ...(anchor ? [anchor] : []),
    ...pageable.slice(page * pageSize, (page + 1) * pageSize),
  ];
  const visibleIds = new Set(nodes.map((node) => node.id));
  const visibleEdges = [...connections.values()]
    .filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))
    .sort((a, b) => b.count - a.count || collate(a.id, b.id));
  const edges = visibleEdges.slice(0, maxEdges);
  for (const edge of edges) edge.kinds.sort(collate);
  const displayedFileIds = new Set(nodes.flatMap((node) => [...members.get(node.id)!]));
  return {
    nodes,
    edges,
    mode,
    scope,
    focus,
    breadcrumbs: breadcrumbs(scope),
    page,
    pageCount,
    totalNodes: ranked.length,
    hiddenNodes: ranked.length - nodes.length,
    totalEdges: connections.size,
    hiddenEdges: connections.size - edges.length,
    matchedFiles: matches.length,
    displayedFiles: displayedFileIds.size,
    graphFiles: sourceNodes.size,
    graphEdges: rawEdges.length,
    collapsedEdges,
  };
}
