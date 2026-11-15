import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ArrowLeft, ArrowRight, ChevronRight, Search } from 'lucide-react';
import type { Anchor, Snapshot } from '../shared/types';
import { projectGraph } from '../shared/graph';
import { Button } from './components';
import './graph-workspace.css';

type Projection = ReturnType<typeof projectGraph>;
type ProjectedNode = Projection['nodes'][number];
type ProjectedEdge = Projection['edges'][number];
type Props = {
  snapshot: Snapshot;
  onSource: (anchor: Anchor) => void;
  initialPaths?: string[];
};

const MAX_NODES = 16;
const MAX_EDGES = 60;
const relationLabel = (kind: string) =>
  kind === 'python-import-candidate' ? 'Importación Python candidata' : 'Importación declarada';

function nodePositions(nodes: ProjectedNode[], edges: ProjectedEdge[], focus: string) {
  const columns = new Map<number, ProjectedNode[]>();
  if (focus) {
    const incoming = new Set(
      edges.filter((edge) => edge.target === focus).map((edge) => edge.source),
    );
    const outgoing = new Set(
      edges.filter((edge) => edge.source === focus).map((edge) => edge.target),
    );
    for (const node of nodes) {
      const column =
        node.id === focus ? 1 : incoming.has(node.id) ? 0 : outgoing.has(node.id) ? 2 : 3;
      columns.set(column, [...(columns.get(column) || []), node]);
    }
  } else {
    const count = nodes.length < 4 ? Math.max(1, nodes.length) : nodes.length < 10 ? 3 : 4;
    nodes.forEach((node, index) => {
      const column = index % count;
      columns.set(column, [...(columns.get(column) || []), node]);
    });
  }
  const positions = new Map<string, { x: number; y: number }>();
  const maxRows = Math.max(1, ...Array.from(columns.values(), (column) => column.length));
  for (const [column, items] of columns) {
    const top = ((maxRows - items.length) * 128) / 2;
    items.forEach((node, index) =>
      positions.set(node.id, { x: column * 275, y: top + index * 128 }),
    );
  }
  return positions;
}

export default function GraphWorkspace({ snapshot, onSource, initialPaths }: Props) {
  const [scope, setScope] = useState('');
  const [focus, setFocus] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState('');
  const [selectedEdge, setSelectedEdge] = useState('');
  const [relationsPage, setRelationsPage] = useState(0);
  const [page, setPage] = useState(0);
  const [direction, setDirection] = useState<'both' | 'dependencies' | 'dependents'>('both');
  const [hops, setHops] = useState<1 | 2>(1);
  const [representation, setRepresentation] = useState<'map' | 'list'>('map');
  const [featureScope, setFeatureScope] = useState(initialPaths?.length ? 'initial' : 'all');
  const featurePaths = useMemo(() => {
    if (featureScope === 'all') return undefined;
    if (featureScope === 'initial') return initialPaths;
    const feature = snapshot.plan.features.find((unit) => unit.id === featureScope);
    if (!feature) return undefined;
    return [
      ...new Set([
        ...feature.sources.map((anchor) => anchor.path),
        ...feature.processes.flatMap((process) => [
          ...process.sources.map((anchor) => anchor.path),
          ...process.steps.flatMap((step) => step.sources.map((anchor) => anchor.path)),
        ]),
      ]),
    ];
  }, [snapshot.plan.features, featureScope, initialPaths]);
  const projection = useMemo(
    () =>
      projectGraph(snapshot.graph, {
        scope,
        focus,
        query,
        direction,
        hops,
        page,
        maxNodes: MAX_NODES,
        maxEdges: MAX_EDGES,
        fileIds: focus ? undefined : featurePaths,
      }),
    [snapshot.graph, scope, focus, query, direction, hops, page, featurePaths],
  );
  const activeNode = projection.nodes.find((node) => node.id === selected);
  const activeEdge = projection.edges.find((edge) => edge.id === selectedEdge);
  const activeFile =
    activeNode?.kind === 'file'
      ? snapshot.graph.nodes.find((node) => node.id === activeNode.id)
      : undefined;
  const relations = useMemo(() => {
    if (!activeFile) return [];
    const sourceIds = new Set(snapshot.graph.nodes.map((node) => node.id));
    return snapshot.graph.edges.filter((edge) => {
      if (!sourceIds.has(edge.source) || !sourceIds.has(edge.target)) return false;
      if (focus && direction === 'dependencies') return edge.source === activeFile.id;
      if (focus && direction === 'dependents') return edge.target === activeFile.id;
      return edge.source === activeFile.id || edge.target === activeFile.id;
    });
  }, [snapshot.graph, activeFile, focus, direction]);
  useEffect(() => setRelationsPage(0), [selected, focus, direction]);
  const positions = useMemo(
    () => nodePositions(projection.nodes, projection.edges, focus),
    [projection, focus],
  );
  // React Flow owns selection and measured dimensions for this projection.
  // Replacing controlled nodes on selection hides them between the two clicks.
  const nodes = useMemo<Node[]>(
    () =>
      projection.nodes.map((node) => ({
        id: node.id,
        data: {
          label: (
            <div className="connection-node-label">
              <span>
                {node.kind === 'directory' ? 'Carpeta' : 'Archivo'}
                {node.external ? ' · fuera de esta carpeta' : ''}
              </span>
              <strong>{node.label}</strong>
              <small>{node.kind === 'directory' ? `${node.fileCount} archivos` : node.path}</small>
            </div>
          ),
        },
        position: positions.get(node.id)!,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        // Let node navigation receive double clicks; the empty canvas still zooms.
        className: `nopan ${node.kind === 'directory' ? 'connection-directory' : 'connection-file'} ${node.external ? 'connection-external' : ''}`,
        selected: node.id === focus,
        ariaLabel: `${node.kind === 'directory' ? 'Carpeta' : 'Archivo'} ${node.path}, ${node.fileCount} archivos`,
      })),
    [projection.nodes, positions, focus],
  );
  const edges = useMemo<Edge[]>(
    () =>
      projection.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.count > 1 ? `${edge.count} importaciones` : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#929d82' },
        style: {
          stroke: selectedEdge === edge.id ? '#d2e7a0' : '#747e70',
          strokeWidth: selectedEdge === edge.id ? 2 : 1,
        },
        type: 'default',
        interactionWidth: 20,
        ariaLabel: `${edge.count} importaciones entre ${edge.source} y ${edge.target}`,
      })),
    [projection.edges, selectedEdge],
  );
  useEffect(() => {
    setSelected(focus || '');
    setSelectedEdge('');
  }, [scope, focus, query, direction, hops, page, featureScope]);
  const selectNode = useCallback((_event: unknown, node: Node) => {
    setSelected(node.id);
    setSelectedEdge('');
  }, []);
  const openNode = useCallback((node: ProjectedNode) => {
    setPage(0);
    setQuery('');
    setSelected('');
    setSelectedEdge('');
    if (node.kind === 'directory') {
      setScope(node.path);
      setFocus('');
    } else {
      setFocus(node.id);
    }
  }, []);
  const doubleClick = useCallback(
    (_event: unknown, node: Node) => {
      const projected = projection.nodes.find((candidate) => candidate.id === node.id);
      if (projected) openNode(projected);
    },
    [projection.nodes, openNode],
  );
  const selectEdge = useCallback((_event: unknown, edge: Edge) => {
    setSelectedEdge(edge.id);
    setSelected('');
  }, []);
  const reset = () => {
    setScope('');
    setFocus('');
    setQuery('');
    setPage(0);
    setFeatureScope('all');
  };
  const openEvidence = (edge: Snapshot['graph']['edges'][number]) => {
    const file = snapshot.graph.nodes.find((node) => node.id === edge.source);
    if (file) onSource({ path: file.path, line: edge.line, end: edge.line, excerpt: '' });
  };
  return (
    <section className="connections-workspace" aria-label="Explorador de conexiones">
      <div className="page-heading compact">
        <div className="breadcrumb">
          {snapshot.name}
          <span>/</span>Conexiones
        </div>
        <h1>Conexiones del repositorio</h1>
        <p>
          Empieza por una carpeta o busca un archivo. Abre sus conexiones para seguir qué necesita y
          qué partes lo utilizan.
        </p>
      </div>
      <div className="connections-controls">
        <label className="search-field connections-search">
          <Search size={15} />
          <input
            aria-label="Filtrar mapa"
            value={query}
            placeholder={
              featureScope === 'all'
                ? 'Buscar archivo o símbolo en todo el repositorio…'
                : 'Buscar archivo o símbolo en este ámbito…'
            }
            onChange={(event) => {
              setQuery(event.target.value);
              setFocus('');
              setScope('');
              setPage(0);
            }}
          />
        </label>
        <label className="connections-scope">
          Explorar
          <select
            aria-label="Ámbito de conexiones"
            value={featureScope}
            onChange={(event) => {
              setFeatureScope(event.target.value);
              setScope('');
              setFocus('');
              setQuery('');
              setPage(0);
            }}
          >
            <option value="all">Todo el repositorio</option>
            {initialPaths?.length ? <option value="initial">Fuentes de tu lectura</option> : null}
            {snapshot.plan.features.map((feature) => (
              <option key={feature.id} value={feature.id}>
                {feature.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="connections-location">
        <nav aria-label="Ubicación en el mapa">
          <button onClick={reset}>Repositorio</button>
          {projection.breadcrumbs
            .filter((crumb) => crumb.path)
            .map((crumb) => (
              <span key={crumb.path}>
                <ChevronRight size={12} />
                <button
                  onClick={() => {
                    setScope(crumb.path);
                    setFocus('');
                    setQuery('');
                    setPage(0);
                  }}
                >
                  {crumb.label}
                </button>
              </span>
            ))}
          {focus && (
            <span>
              <ChevronRight size={12} />
              <strong>
                {snapshot.graph.nodes.find((node) => node.id === focus)?.label || focus}
              </strong>
            </span>
          )}
          {query && (
            <span>
              <ChevronRight size={12} />
              <strong>Resultados de búsqueda</strong>
            </span>
          )}
        </nav>
        <div className="connections-representation" aria-label="Representación">
          <button aria-pressed={representation === 'map'} onClick={() => setRepresentation('map')}>
            Mapa
          </button>
          <button
            aria-pressed={representation === 'list'}
            onClick={() => setRepresentation('list')}
          >
            Lista
          </button>
        </div>
      </div>
      {focus && featureScope !== 'all' && (
        <p className="connections-scope-note">
          Las conexiones del archivo se exploran en toda la captura, incluidas las que salen de las
          fuentes de esta lectura.
        </p>
      )}
      {focus && (
        <div className="connections-neighborhood">
          <span>
            Conexiones de{' '}
            <strong>{snapshot.graph.nodes.find((node) => node.id === focus)?.path}</strong>
          </span>
          <label>
            Dirección{' '}
            <select
              aria-label="Dirección de las conexiones"
              value={direction}
              onChange={(event) => {
                setDirection(event.target.value as typeof direction);
                setPage(0);
              }}
            >
              <option value="both">Ambas direcciones</option>
              <option value="dependencies">Lo que necesita</option>
              <option value="dependents">Lo que lo utiliza</option>
            </select>
          </label>
          <label>
            Distancia{' '}
            <select
              aria-label="Distancia de las conexiones"
              value={hops}
              onChange={(event) => {
                setHops(Number(event.target.value) as 1 | 2);
                setPage(0);
              }}
            >
              <option value={1}>1 conexión</option>
              <option value={2}>2 conexiones</option>
            </select>
          </label>
          <button
            onClick={() => {
              setFocus('');
              setPage(0);
            }}
          >
            Volver a carpetas
          </button>
        </div>
      )}
      <div className="connections-body">
        <div className="connections-main">
          {representation === 'map' ? (
            <div className="map-canvas connections-canvas">
              {nodes.length ? (
                <ReactFlow
                  key={[snapshot.id, scope, focus, query, page, direction, hops, featureScope].join(
                    '|',
                  )}
                  defaultNodes={nodes}
                  edges={edges}
                  fitView
                  fitViewOptions={{ padding: 0.16, maxZoom: 1 }}
                  nodesConnectable={false}
                  nodesDraggable={false}
                  deleteKeyCode={null}
                  onNodeClick={selectNode}
                  onNodeDoubleClick={doubleClick}
                  onEdgeClick={selectEdge}
                  minZoom={0.2}
                  maxZoom={1.8}
                  onlyRenderVisibleElements={nodes.length > 16}
                  colorMode="dark"
                >
                  <Background gap={28} size={1} color="#303841" />
                  <Controls showInteractive={false} />
                </ReactFlow>
              ) : (
                <div className="connections-empty">
                  <h2>No hay coincidencias</h2>
                  <p>Prueba con otra ruta o símbolo, o vuelve al repositorio.</p>
                  <button onClick={reset}>Ver el repositorio</button>
                </div>
              )}
            </div>
          ) : (
            <div className="connections-list" aria-label="Elementos del mapa">
              {projection.nodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => {
                    setSelected(node.id);
                    setSelectedEdge('');
                  }}
                  aria-pressed={selected === node.id}
                >
                  <span>
                    <strong>{node.path || node.label}</strong>
                    <small>
                      {node.kind === 'directory'
                        ? `${node.fileCount} archivos agrupados`
                        : node.symbols.slice(0, 3).join(' · ') || 'Archivo de la captura'}
                    </small>
                  </span>
                  <span>
                    {node.inbound} entrantes · {node.outbound} salientes
                  </span>
                </button>
              ))}
              {!projection.nodes.length && <p>No hay elementos en este ámbito.</p>}
            </div>
          )}
          <div className="connections-coverage" role="status">
            <span>
              {projection.nodes.length} de {projection.totalNodes} elementos ·{' '}
              {projection.displayedFiles} de {projection.graphFiles} archivos representados
            </span>
            {projection.pageCount > 1 && (
              <div className="connections-pagination">
                <button
                  aria-label="Página anterior del mapa"
                  disabled={page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  <ArrowLeft size={13} />
                </button>
                <span>
                  Página {projection.page + 1} de {projection.pageCount}
                </span>
                <button
                  aria-label="Página siguiente del mapa"
                  disabled={page + 1 >= projection.pageCount}
                  onClick={() => setPage(page + 1)}
                >
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
          {projection.collapsedEdges > 0 && (
            <p className="connections-collapsed">
              {projection.collapsedEdges} importaciones quedan dentro de las carpetas agrupadas.
              Abre una carpeta para examinarlas.
            </p>
          )}
          {(projection.hiddenNodes > 0 || projection.hiddenEdges > 0) && (
            <p className="connections-limit">
              Vista acotada: {projection.hiddenNodes} elementos y {projection.hiddenEdges}{' '}
              relaciones fuera de la vista. Busca un archivo, abre una carpeta o usa sus referencias
              para acotar las conexiones.
            </p>
          )}
        </div>
        <aside className="connections-detail" aria-label="Detalle de conexiones">
          {activeNode ? (
            <>
              <span className="connections-detail-type">
                {activeNode.kind === 'directory' ? 'Carpeta' : 'Archivo'}
              </span>
              <h2>{activeNode.label}</h2>
              <p className="connections-detail-path">{activeNode.path || '/'}</p>
              {activeNode.kind === 'directory' ? (
                <>
                  <p>
                    {activeNode.fileCount} archivos agrupados; {activeNode.internalEdges}{' '}
                    importaciones internas. Las flechas resumen las importaciones entre esta carpeta
                    y los demás elementos visibles.
                  </p>
                  <Button primary onClick={() => openNode(activeNode)}>
                    Abrir carpeta
                  </Button>
                </>
              ) : (
                <>
                  {activeFile?.symbols.length ? (
                    <p className="connections-symbols">
                      {activeFile.symbols.slice(0, 8).join(' · ')}
                    </p>
                  ) : null}
                  <div className="connections-detail-actions">
                    <Button onClick={() => openNode(activeNode)}>Ver conexiones</Button>
                    <Button
                      primary
                      onClick={() =>
                        onSource({ path: activeNode.path, line: 1, end: 1, excerpt: '' })
                      }
                    >
                      Leer código
                    </Button>
                  </div>
                  <h3>Importaciones relacionadas</h3>
                  {relations.length ? (
                    <ul className="connections-relations">
                      {relations.slice(relationsPage * 30, (relationsPage + 1) * 30).map((edge) => (
                        <li key={edge.id}>
                          <button onClick={() => openEvidence(edge)}>
                            <span>{edge.source === activeNode.id ? 'Necesita' : 'Lo utiliza'}</span>
                            <strong>
                              {edge.source === activeNode.id ? edge.target : edge.source}
                            </strong>
                            <small>
                              {relationLabel(edge.kind)} · línea {edge.line}
                            </small>
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>
                      No se localizaron importaciones internas para este archivo. Puede conectarse
                      mediante configuración, servicios externos o relaciones que el análisis no
                      reconoce.
                    </p>
                  )}
                  {relations.length > 30 && (
                    <div className="connections-reference-pages">
                      <span>
                        Referencias {relationsPage * 30 + 1}–
                        {Math.min((relationsPage + 1) * 30, relations.length)} de {relations.length}
                      </span>
                      <button
                        disabled={relationsPage === 0}
                        onClick={() => setRelationsPage(relationsPage - 1)}
                      >
                        Anteriores
                      </button>
                      <button
                        disabled={(relationsPage + 1) * 30 >= relations.length}
                        onClick={() => setRelationsPage(relationsPage + 1)}
                      >
                        Siguientes
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : activeEdge ? (
            <>
              <h2>
                {activeEdge.count === 1 ? 'Una importación' : `${activeEdge.count} importaciones`}
              </h2>
              <p>
                Desde{' '}
                <strong>
                  {projection.nodes.find((node) => node.id === activeEdge.source)?.path}
                </strong>{' '}
                hacia{' '}
                <strong>
                  {projection.nodes.find((node) => node.id === activeEdge.target)?.path}
                </strong>
                .
              </p>
              <p>Abre una declaración para comprobar la relación en su archivo de origen.</p>
              <ul className="connections-relations">
                {activeEdge.evidence.map((edge) => (
                  <li key={edge.id}>
                    <button onClick={() => openEvidence(edge)}>
                      <strong>{edge.source}</strong>
                      <small>
                        {relationLabel(edge.kind)} · línea {edge.line}
                      </small>
                    </button>
                  </li>
                ))}
              </ul>
              {activeEdge.count > activeEdge.evidence.length && (
                <p>
                  {activeEdge.evidence.length} referencias de muestra de {activeEdge.count}{' '}
                  importaciones agrupadas. Entra en la carpeta para ver más detalle.
                </p>
              )}
            </>
          ) : (
            <>
              <h2>Sigue una conexión</h2>
              <p>
                Selecciona una carpeta para entrar en ella o un archivo para examinar sus
                dependencias.
              </p>
              <ol>
                <li>Empieza por una parte del sistema.</li>
                <li>Abre sus conexiones inmediatas.</li>
                <li>Comprueba la relación en el código.</li>
              </ol>
              <p>
                Las flechas van del archivo que importa al archivo importado. Dos conexiones
                muestran un recorrido estructural, sin demostrar el orden de ejecución.
              </p>
            </>
          )}
        </aside>
      </div>
      <p className="connections-evidence-note">
        {snapshot.graph.nodes.length} archivos y {snapshot.graph.edges.length} importaciones en la
        captura. Las agrupaciones siguen las carpetas del proyecto; las relaciones Python son
        candidatas. El mapa no observa llamadas, valores ni servicios durante la ejecución.
      </p>
      {snapshot.graph.analysis && (
        <details className="connections-analysis">
          <summary>Qué se analizó en esta captura</summary>
          <dl>
            <div>
              <dt>Archivos analizados por sintaxis</dt>
              <dd>{snapshot.graph.analysis.parsedFiles}</dd>
            </div>
            <div>
              <dt>Archivos Python con relaciones candidatas</dt>
              <dd>{snapshot.graph.analysis.candidateFiles}</dd>
            </div>
            <div>
              <dt>Otros archivos sin relaciones analizadas</dt>
              <dd>{snapshot.graph.analysis.otherFiles}</dd>
            </div>
            <div>
              <dt>Importaciones locales sin resolver</dt>
              <dd>{snapshot.graph.analysis.unresolvedLocalImports}</dd>
            </div>
            <div>
              <dt>Importaciones de paquetes o alias</dt>
              <dd>{snapshot.graph.analysis.externalImports}</dd>
            </div>
            <div>
              <dt>Importaciones dinámicas sin resolver</dt>
              <dd>{snapshot.graph.analysis.dynamicImports}</dd>
            </div>
          </dl>
          <ul>
            {snapshot.graph.analysis.limitations.map((limitation, index) => (
              <li key={index}>{limitation}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
