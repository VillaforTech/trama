import { useEffect, useMemo, useState, useRef } from 'react';
import { ReactFlow, Background, Controls, MarkerType, type Node, type Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Download,
  ExternalLink,
  Eye,
  FileCode2,
  GitBranch,
  HelpCircle,
  Lightbulb,
  Loader2,
  Search,
  Settings2,
  Sparkles,
  Target,
  RefreshCw,
} from 'lucide-react';
import type { Anchor, Learning, Process, Snapshot, Unit } from '../shared/types';
import type { AskResult, Exercise, ProviderConfig } from '../shared/learning';
import { api, DEMO, request } from './api';
import { Button, Citation, Empty, Install, Pill } from './components';

type StudyProps = {
  snapshot: Snapshot;
  learning: Learning;
  onChange: (learning: Learning) => void;
};
type Sources = { onSource: (anchor: Anchor) => void };
const rowKey = (unit: string, process: string, index: number) => unit + '/' + process + '/' + index;
export function Reader({
  snapshot,
  unit,
  process,
  stepIndex,
  learning,
  onChange,
  onStep,
  onProcess,
  onSource,
  onTutor,
  onPractice,
}: StudyProps &
  Sources & {
    unit: Unit;
    process: Process;
    stepIndex: number;
    onStep: (n: number) => void;
    onProcess: (id: string) => void;
    onTutor: () => void;
    onPractice: () => void;
  }) {
  const index = Math.min(stepIndex, process.steps.length - 1),
    step = process.steps[index],
    key = rowKey(unit.id, process.id, index),
    record = learning.answers?.[key] || {};
  if (!step)
    return (
      <Empty title="Este proceso necesita más fuentes">
        Explora los archivos para localizar su implementación.
      </Empty>
    );
  const patch = (value: Partial<typeof record>) =>
    onChange({
      ...learning,
      answers: {
        ...learning.answers,
        [key]: { ...record, ...value, updatedAt: new Date().toISOString() },
      },
    });
  const start = step.sources[0],
    related = step.sources.slice(1);
  return (
    <>
      <div className="breadcrumb">
        <GitBranch size={14} />
        {unit.title}
        <span>/</span>
        {process.title}
      </div>
      <div className="reader-layout">
        <aside className="step-rail">
          <label htmlFor="process-select">Proceso</label>
          <select
            id="process-select"
            value={process.id}
            onChange={(e) => onProcess(e.target.value)}
          >
            {unit.processes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          <nav aria-label="Pasos de lectura">
            {process.steps.map((s, i) => (
              <button key={i} className={i === index ? 'active' : ''} onClick={() => onStep(i)}>
                <span>
                  {learning.answers?.[rowKey(unit.id, process.id, i)]?.revealed ? (
                    <Check size={12} />
                  ) : (
                    i + 1
                  )}
                </span>
                {s.title}
              </button>
            ))}
          </nav>
          <p>Los pasos proponen un orden de lectura. Contrasta qué ocurre en ejecución.</p>
        </aside>
        <article className="lesson">
          <div className="lesson-meta">
            <span>
              Paso {index + 1} de {process.steps.length}
            </span>
            <Pill status={step.status} />
          </div>
          <h1>{step.title}</h1>
          <p className="lesson-question">{questionFor(step.title)}</p>
          {!record.revealed ? (
            <>
              <label className="field prediction">
                Tu predicción
                <textarea
                  rows={4}
                  placeholder="Creo que recibe… y después…"
                  value={record.prediction || ''}
                  onChange={(e) => patch({ prediction: e.target.value })}
                />
              </label>
              <div className="lesson-actions">
                <Button primary onClick={() => patch({ revealed: true })}>
                  Contrastar con el código <ArrowRight size={15} />
                </Button>
                <button className="text-button" onClick={() => patch({ hintUsed: true })}>
                  <Lightbulb size={14} />
                  Necesito una pista
                </button>
              </div>
              {record.hintUsed && (
                <p className="hint">
                  Identifica una entrada, una decisión y una salida. Empieza por el nombre de la
                  operación y pregunta qué condiciones debe cumplir quien la llama.
                </p>
              )}
              <p className="footnote">Puedes abrir la fuente aunque todavía no sepas responder.</p>
            </>
          ) : (
            <>
              {record.prediction && (
                <div className="prediction-saved">
                  <span>
                    Tu predicción {record.hintUsed ? '· con pista' : '· antes de abrir la fuente'}
                  </span>
                  <p>{record.prediction}</p>
                </div>
              )}
              <div className="section-title">
                <h2>Lo que puedes observar</h2>
              </div>
              <p>{step.detail}</p>
              {start && (
                <div className="inline-code">
                  <div>
                    <FileCode2 size={13} />
                    <span>{start.path}</span>
                    <button onClick={() => onSource(start)}>
                      Abrir archivo <ArrowUpRight size={12} />
                    </button>
                  </div>
                  <pre>
                    <code>
                      {start.excerpt.split(/\r\n|\r|\n/).map((line, i) => (
                        <span className="code-fragment-line" key={i}>
                          <b>{start.line + i}</b>
                          {line || ' '}
                          <br />
                        </span>
                      ))}
                    </code>
                  </pre>
                </div>
              )}
              {related.length > 0 && (
                <div className="linked-sources">
                  <h3>Sigue la conexión</h3>
                  {related.map((a, i) => (
                    <Citation key={i} anchor={a} onClick={onSource} />
                  ))}
                </div>
              )}
              <div className="reflection">
                <h3>¿Qué cambió en tu explicación?</h3>
                <div className="choice-row">
                  <button
                    className={record.review === 'match' ? 'chosen' : ''}
                    onClick={() => patch({ review: 'match' })}
                  >
                    <CheckCircle2 size={15} />
                    Coincidió
                  </button>
                  <button
                    className={record.review === 'gap' ? 'chosen' : ''}
                    onClick={() => patch({ review: 'gap' })}
                  >
                    <HelpCircle size={15} />
                    Me faltó una conexión
                  </button>
                </div>
                {record.review === 'gap' && (
                  <label className="field">
                    Qué falta por resolver
                    <textarea
                      rows={2}
                      value={record.reflection || ''}
                      onChange={(e) => patch({ reflection: e.target.value })}
                      placeholder="La entrada está clara, pero no sé de dónde viene…"
                    />
                  </label>
                )}
              </div>
              <details className="disclosure">
                <summary>
                  Razonar sobre una variante <ChevronDown size={14} />
                </summary>
                <label className="field">
                  ¿Qué pasaría si cambia una condición de esta operación?
                  <textarea
                    rows={3}
                    value={record.variant || ''}
                    onChange={(e) => patch({ variant: e.target.value })}
                    placeholder="Cambiaría… y lo comprobaría en…"
                  />
                </label>
              </details>
              <div className="lesson-actions">
                <button className="text-button" onClick={onTutor}>
                  <Sparkles size={15} />
                  Profundizar con mi modelo
                </button>
                {index < process.steps.length - 1 ? (
                  <Button primary onClick={() => onStep(index + 1)}>
                    Siguiente paso <ArrowRight size={15} />
                  </Button>
                ) : (
                  <Button primary onClick={onPractice}>
                    Practicar sin ayuda <Target size={15} />
                  </Button>
                )}
              </div>
            </>
          )}
        </article>
      </div>
      {snapshot.source === 'example' && snapshot.name.toLowerCase().includes('pedidos') && (
        <PedidoLab snapshot={snapshot} onSource={onSource} />
      )}
    </>
  );
}
function questionFor(title: string) {
  if (/salida|return|resultado/i.test(title))
    return '¿Qué sale de esta operación y de qué depende ese resultado?';
  if (/condici|error/i.test(title))
    return '¿Qué hace que se tome esta rama? ¿Qué ocurre en el caso contrario?';
  if (/valor|config/i.test(title)) return '¿De dónde viene este valor y dónde se utiliza después?';
  return '¿Qué recibe esta parte del sistema y qué responsabilidad cumple?';
}

function PedidoLab({ snapshot, onSource }: Sources & { snapshot: Snapshot }) {
  const [units, setUnits] = useState(3),
    [fail, setFail] = useState(false),
    [replay, setReplay] = useState(false);
  const anchor =
    snapshot.plan.features.flatMap((x) => x.sources).find((s) => s.path.includes('crear-pedido')) ||
    snapshot.plan.features.flatMap((x) => x.sources).find((s) => s.path.includes('routes'));
  const valid = Number.isInteger(units) && units >= 1 && units <= 100;
  return (
    <details className="lab-disclosure">
      <summary>
        <span>
          <Code2 size={17} />
          Prueba una variante del ejemplo
        </span>
        <ChevronDown size={16} />
      </summary>
      <div className="lab-body">
        <div>
          <h3>Un pedido y su evento</h3>
          <p>
            Modelo didáctico del ejemplo original. Precio de 250 centavos, de 1 a 100 unidades y un
            movimiento por evento.
          </p>
          <label className="field">
            Unidades
            <input
              type="number"
              min="0"
              max="101"
              value={units}
              onChange={(e) => setUnits(Number(e.target.value))}
            />
          </label>
          <label className="check-field">
            <input type="checkbox" checked={fail} onChange={(e) => setFail(e.target.checked)} />
            Falla la escritura del evento
          </label>
          <label className="check-field">
            <input type="checkbox" checked={replay} onChange={(e) => setReplay(e.target.checked)} />
            El worker recibe el mismo evento dos veces
          </label>
        </div>
        <div className="lab-result">
          <span>Resultado esperado</span>
          <strong>{!valid ? '422' : fail ? '500' : '201'}</strong>
          <dl>
            <dt>Importe</dt>
            <dd>{valid ? units * 250 : 0} centavos</dd>
            <dt>Pedidos guardados</dt>
            <dd>{valid && !fail ? 1 : 0}</dd>
            <dt>Movimientos tras procesar el evento</dt>
            <dd>{valid && !fail ? 1 : 0}</dd>
          </dl>
          <p>
            {!valid
              ? 'La validación rechaza la cantidad.'
              : fail
                ? 'La transacción revierte la inserción del pedido.'
                : replay
                  ? 'El identificador único del evento impide repetir el movimiento.'
                  : 'El pedido y su evento se guardan. El worker procesa el evento después.'}
          </p>
          {anchor && (
            <Citation anchor={anchor} onClick={onSource} label="Contrastar con la implementación" />
          )}
        </div>
      </div>
    </details>
  );
}

export function MapView({ snapshot, onSource }: Sources & { snapshot: Snapshot }) {
  const [focus, setFocus] = useState(''),
    [filter, setFilter] = useState(''),
    [selected, setSelected] = useState('');
  const graph = snapshot.graph;
  const visible = useMemo(() => {
    if (focus) {
      const neighbors = new Set([focus]);
      graph.edges.forEach((e) => {
        if (e.source === focus) neighbors.add(e.target);
        if (e.target === focus) neighbors.add(e.source);
      });
      return graph.nodes.filter((n) => neighbors.has(n.id));
    }
    return graph.nodes
      .filter((n) => !filter || n.path.toLowerCase().includes(filter.toLowerCase()))
      .slice(0, 70);
  }, [graph, focus, filter]);
  const ids = new Set(visible.map((n) => n.id));
  const nodes: Node[] = visible.map((n, i) => ({
    id: n.id,
    data: {
      label: (
        <>
          <FileCode2 size={16} />
          <strong>{n.label}</strong>
          <small>{n.path}</small>
          <span>{n.symbols.slice(0, 2).join(' · ') || n.kind}</span>
        </>
      ),
    },
    position: { x: (i % 3) * 285, y: Math.floor(i / 3) * 155 },
    className: selected === n.id ? 'selected-file' : '',
    sourcePosition: 'right' as never,
    targetPosition: 'left' as never,
  }));
  const edges: Edge[] = graph.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e) => ({
      ...e,
      label: e.kind,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#718b69' },
      style: { stroke: '#718b69' },
      type: 'smoothstep',
    }));
  const active = graph.nodes.find((n) => n.id === selected);
  return (
    <>
      <div className="page-heading compact">
        <div className="breadcrumb">
          {snapshot.name}
          <span>/</span>Mapa
        </div>
        <h1>Explora las conexiones.</h1>
        <p>Selecciona un archivo para ver sus símbolos y acercarte a sus dependencias.</p>
      </div>
      <div className="map-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            aria-label="Filtrar mapa"
            value={filter}
            placeholder="Buscar un archivo…"
            onChange={(e) => {
              setFilter(e.target.value);
              setFocus('');
            }}
          />
        </label>
        <span>
          {visible.length} de {graph.nodes.length} archivos
        </span>
        {focus && (
          <button className="text-button" onClick={() => setFocus('')}>
            Ver todo <ArrowUpRight size={13} />
          </button>
        )}
      </div>
      <div className="map-canvas">
        {nodes.length ? (
          <ReactFlow
            key={focus + filter}
            nodes={nodes}
            edges={edges}
            fitView
            nodesConnectable={false}
            deleteKeyCode={null}
            onNodeClick={(_, n) => setSelected(n.id)}
            onNodeDoubleClick={(_, n) => setFocus(n.id)}
            onEdgeClick={(_, e) => {
              const origin = graph.edges.find((x) => x.id === e.id),
                file = graph.nodes.find((x) => x.id === e.source);
              if (origin && file)
                onSource({ path: file.path, line: origin.line, end: origin.line, excerpt: '' });
            }}
            minZoom={0.18}
            maxZoom={1.6}
          >
            <Background gap={22} size={1} color="#354455" />
            <Controls showInteractive={false} />
          </ReactFlow>
        ) : (
          <Empty title="No hay archivos que coincidan">Prueba otra parte de la ruta.</Empty>
        )}
      </div>
      {active && (
        <div className="map-selection">
          <FileCode2 size={21} />
          <div>
            <b>{active.path}</b>
            <p>{active.symbols.join(' · ') || 'Abre el archivo para leer sus declaraciones.'}</p>
          </div>
          <Button onClick={() => setFocus(active.id)}>Ver conexiones</Button>
          <Button
            primary
            onClick={() => onSource({ path: active.path, line: 1, end: 1, excerpt: '' })}
          >
            Leer código <ArrowUpRight size={14} />
          </Button>
        </div>
      )}
      <p className="footnote">
        Las flechas representan dependencias escritas. Selecciona una flecha para leer su
        declaración. Haz doble clic en un archivo para centrar sus conexiones.
      </p>
    </>
  );
}

export function Explorer({ snapshot, onSource }: Sources & { snapshot: Snapshot }) {
  const [query, setQuery] = useState(''),
    [results, setResults] = useState<{ path: string; line: number; text: string }[] | null>(null),
    [error, setError] = useState('');
  const filtered = snapshot.files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase()));
  async function search() {
    try {
      const data = await api.search(snapshot.id, query);
      setResults(data.matches);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="page-heading compact">
        <div className="breadcrumb">
          {snapshot.name}
          <span>/</span>Fuentes
        </div>
        <h1>Encuentra la implementación.</h1>
        <p>Busca una ruta o una expresión en los archivos de esta revisión.</p>
      </div>
      <form
        className="explorer-search"
        onSubmit={(e) => {
          e.preventDefault();
          search();
        }}
      >
        <label className="search-field">
          <Search size={17} />
          <input
            aria-label="Buscar en el repositorio"
            value={query}
            placeholder="Un archivo, una función o un valor…"
            onChange={(e) => {
              setQuery(e.target.value);
              setResults(null);
            }}
          />
        </label>
        <Button type="submit" disabled={!query.trim()}>
          Buscar en el contenido
        </Button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="section-title">
        <h2>{results ? 'Coincidencias en el código' : 'Archivos de la captura'}</h2>
        <span>{results ? results.length : filtered.length}</span>
      </div>
      <div className="file-list">
        {results
          ? results.map((r, i) => (
              <button
                key={i}
                onClick={() =>
                  onSource({ path: r.path, line: r.line, end: r.line, excerpt: r.text })
                }
              >
                <FileCode2 size={16} />
                <span>
                  <b>
                    {r.path} · L{r.line}
                  </b>
                  <code>{r.text}</code>
                </span>
                <ArrowUpRight size={14} />
              </button>
            ))
          : filtered.slice(0, 250).map((f) => (
              <button
                key={f.path}
                onClick={() => onSource({ path: f.path, line: 1, end: 1, excerpt: '' })}
              >
                <FileCode2 size={16} />
                <span>{f.path}</span>
                <small>{(f.size / 1024).toFixed(1)} KB</small>
                <ArrowUpRight size={14} />
              </button>
            ))}
      </div>
      {!results && filtered.length > 250 && (
        <p className="footnote">
          Mostrando los primeros 250 archivos. Usa la búsqueda para acotar.
        </p>
      )}
      {(results?.length === 0 || (!results && !filtered.length)) && (
        <Empty title="No hay coincidencias">Prueba otro nombre o una expresión más breve.</Empty>
      )}
    </>
  );
}

export function Practice({
  snapshot,
  learning,
  onChange,
  onSource,
  openSource,
}: StudyProps & Sources & { openSource?: Anchor | null }) {
  const [exercises, setExercises] = useState<Exercise[]>([]),
    [current, setCurrent] = useState(0),
    [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    request<Exercise[]>('/snapshots/' + snapshot.id + '/exercises')
      .then((x) => {
        if (live) {
          setExercises(x);
          setCurrent(0);
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [snapshot.id]);
  const exercise = exercises[current],
    key = 'exercise/' + exercise?.id,
    record = learning.answers?.[key] || {};
  const patch = (v: Partial<typeof record>) =>
    onChange({
      ...learning,
      answers: {
        ...learning.answers,
        [key]: { ...record, ...v, updatedAt: new Date().toISOString() },
      },
    });
  useEffect(() => {
    if (openSource && exercise && !record.revealed && !record.hintUsed) patch({ hintUsed: true });
  }, [openSource, exercise?.id]);
  const attempts = learning.attempts || [],
    latest = new Map(attempts.map((a) => [a.exerciseId, a])),
    due = [...latest.values()].filter((a) => a.dueAt <= new Date().toISOString()).length;
  function grade(review: 'correct' | 'partial' | 'gap') {
    const now = new Date(),
      days = review === 'correct' ? 7 : review === 'partial' ? 3 : 1;
    onChange({
      ...learning,
      answers: {
        ...learning.answers,
        [key]: { ...record, review: review === 'correct' ? 'match' : 'gap' },
      },
      attempts: [
        ...attempts,
        {
          id: crypto.randomUUID(),
          exerciseId: exercise.id,
          answer: record.prediction || '',
          assisted: !!record.hintUsed,
          review,
          createdAt: now.toISOString(),
          dueAt: new Date(now.getTime() + days * 86400000).toISOString(),
        },
      ],
    });
  }
  return (
    <>
      <div className="page-heading compact">
        <div className="breadcrumb">
          {snapshot.name}
          <span>/</span>Práctica
        </div>
        <h1>Comprueba lo que puedes explicar.</h1>
        <p>
          Responde antes de consultar las fuentes. Después contrasta tu razonamiento con los
          criterios.
        </p>
      </div>
      {error && <p className="error">{error}</p>}
      {!exercise ? (
        <Empty title={error ? 'La práctica necesita fuentes' : 'Preparando preguntas…'}>
          {error || 'Buscando operaciones que puedas reconstruir y variar.'}
        </Empty>
      ) : (
        <div className="practice-layout">
          <aside className="exercise-list">
            {exercises.map((x, i) => (
              <button
                key={x.id}
                className={i === current ? 'active' : ''}
                onClick={() => setCurrent(i)}
              >
                <span>{i + 1}</span>
                <div>
                  <b>{x.title}</b>
                  <small>
                    {
                      { predict: 'Predicción', trace: 'Reconstrucción', transfer: 'Transferencia' }[
                        x.kind
                      ]
                    }
                  </small>
                </div>
                {attempts.some((a) => a.exerciseId === x.id) && <Check size={13} />}
              </button>
            ))}
            <p>
              {attempts.length} intentos guardados{due ? ' · ' + due + ' pendientes de repaso' : ''}
            </p>
          </aside>
          <article className="exercise">
            <div className="lesson-meta">
              <span>
                Pregunta {current + 1} de {exercises.length}
              </span>
              <span className="pill">
                {record.hintUsed
                  ? 'Ayudas abiertas en este intento'
                  : 'Sin ayudas abiertas en este intento'}
              </span>
            </div>
            <h2>{exercise.title}</h2>
            <p className="exercise-prompt">{exercise.prompt}</p>
            <label className="field">
              Tu razonamiento
              <textarea
                rows={6}
                readOnly={!!record.revealed}
                value={record.prediction || ''}
                onChange={(e) => patch({ prediction: e.target.value })}
                placeholder="Creo que… porque… Lo comprobaría en…"
              />
            </label>
            {!record.revealed ? (
              <div className="lesson-actions">
                <Button
                  primary
                  disabled={!record.prediction?.trim()}
                  onClick={() => patch({ revealed: true })}
                >
                  Contrastar mi respuesta <ArrowRight size={15} />
                </Button>
                <button className="text-button" onClick={() => patch({ hintUsed: true })}>
                  <BookOpen size={14} />
                  Consultar fuentes
                </button>
              </div>
            ) : (
              <div className="rubric">
                <h3>Una respuesta fundamentada</h3>
                <p>{exercise.expectedAnswer}</p>
                <ul>
                  {exercise.rubric.map((text, i) => (
                    <li key={i}>
                      <Check size={15} />
                      {text}
                    </li>
                  ))}
                </ul>
                {!record.review ? (
                  <>
                    <p className="footnote">Valora tu respuesta según estos criterios.</p>
                    <div className="choice-row">
                      <button onClick={() => grade('correct')}>La pude justificar</button>
                      <button onClick={() => grade('partial')}>Me faltó una parte</button>
                      <button onClick={() => grade('gap')}>Necesito volver al código</button>
                    </div>
                  </>
                ) : (
                  <p className="success">
                    <CheckCircle2 size={15} />
                    Autoevaluación guardada para el próximo repaso.
                  </p>
                )}
                <div className="lesson-actions">
                  <button
                    className="text-button"
                    onClick={() => {
                      patch({
                        prediction: '',
                        revealed: false,
                        review: undefined,
                        hintUsed: false,
                      });
                    }}
                  >
                    Repetir sin la respuesta
                  </button>
                  {current < exercises.length - 1 && (
                    <Button onClick={() => setCurrent(current + 1)}>
                      Siguiente pregunta <ArrowRight size={14} />
                    </Button>
                  )}
                </div>
              </div>
            )}
            {(record.hintUsed || record.revealed) && (
              <div className="linked-sources">
                {exercise.sources.map((a, i) => (
                  <Citation key={i} anchor={a} onClick={onSource} />
                ))}
              </div>
            )}
          </article>
        </div>
      )}
      <p className="footnote">
        Los intentos registran tu respuesta, las ayudas abiertas aquí y tu autoevaluación. No
        registran consultas fuera de Trama. El repaso se propone a 1, 3 o 7 días según esa
        valoración.
      </p>
    </>
  );
}

export function Notebook({
  snapshot,
  learning,
  onChange,
  onResume,
  onExport,
}: StudyProps & { onResume: () => void; onExport: () => void }) {
  const records = Object.entries(learning.answers || {}).filter(
      ([, r]) => r.prediction || r.reflection || r.variant,
    ),
    attempts = learning.attempts || [];
  function label(key: string) {
    if (key.startsWith('exercise/')) return 'Práctica de razonamiento';
    const [uid, pid, index] = key.split('/'),
      unit = snapshot.plan.features.find((f) => f.id === uid),
      process = unit?.processes.find((p) => p.id === pid);
    return (
      (process?.title || 'Proceso') + ' · ' + (process?.steps[Number(index)]?.title || 'Reflexión')
    );
  }
  return (
    <>
      <div className="page-heading compact">
        <div className="breadcrumb">
          {snapshot.name}
          <span>/</span>Mi aprendizaje
        </div>
        <h1>Lo que has conectado.</h1>
        <p>Tu explicación, tus dudas y la evidencia de cada intento, vinculadas a esta revisión.</p>
      </div>
      <div className="notebook-actions">
        <Button onClick={onExport}>
          <Download size={14} />
          Descargar cuaderno y fuentes
        </Button>
        <Button onClick={onResume}>
          Retomar mi lectura <ArrowRight size={14} />
        </Button>
      </div>
      <label className="field notebook-text">
        Mi explicación del sistema
        <textarea
          rows={6}
          placeholder="Este sistema recibe… Sus partes se conectan… Lo que todavía necesito comprobar es…"
          value={learning.notes || ''}
          onChange={(e) => onChange({ ...learning, notes: e.target.value })}
        />
      </label>
      <div className="section-title">
        <h2>Predicciones y preguntas abiertas</h2>
        <span>{records.length}</span>
      </div>
      {records.length ? (
        records.map(([key, r]) => (
          <details className="notebook-entry" key={key}>
            <summary>
              <span>
                <b>{label(key)}</b>
                <small>
                  {r.review === 'gap'
                    ? 'Una conexión por resolver'
                    : r.review === 'match'
                      ? 'Contrastado por ti'
                      : 'En estudio'}
                </small>
              </span>
              <ChevronDown size={15} />
            </summary>
            <div>
              {r.prediction && (
                <p>
                  <strong>Predicción</strong>
                  <br />
                  {r.prediction}
                </p>
              )}
              {r.reflection && (
                <p>
                  <strong>Duda</strong>
                  <br />
                  {r.reflection}
                </p>
              )}
              {r.variant && (
                <p>
                  <strong>Variante</strong>
                  <br />
                  {r.variant}
                </p>
              )}
              <span className="footnote">
                {r.hintUsed ? 'Consultaste una ayuda.' : 'Sin ayuda registrada.'}
              </span>
            </div>
          </details>
        ))
      ) : (
        <Empty title="Tu cuaderno empieza con una pregunta">
          Abre un proceso y escribe qué esperas encontrar antes de leer la fuente.
        </Empty>
      )}
      {attempts.length > 0 && (
        <>
          <div className="section-title">
            <h2>Intentos y próximos repasos</h2>
          </div>
          <div className="attempts-table">
            {attempts
              .slice()
              .reverse()
              .map((a) => (
                <div key={a.id}>
                  <span>
                    <b>
                      {
                        {
                          correct: 'Pude justificarlo',
                          partial: 'Me faltó una parte',
                          gap: 'Volver al código',
                        }[a.review]
                      }
                    </b>
                    <small>
                      {a.assisted ? 'Con ayudas del intento' : 'Sin ayudas del intento'} ·{' '}
                      {new Date(a.createdAt).toLocaleDateString('es')}
                    </small>
                  </span>
                  <span>Repasar {new Date(a.dueAt).toLocaleDateString('es')}</span>
                </div>
              ))}
          </div>
        </>
      )}
      {!!learning.sessions?.length && (
        <>
          <div className="section-title">
            <h2>Consultas a tu modelo</h2>
          </div>
          {learning.sessions.map((s) => (
            <details className="notebook-entry" key={s.id}>
              <summary>
                {s.question}
                <ChevronDown size={15} />
              </summary>
              <div>
                <p>{(s.answer as AskResult['answer']).summary}</p>
                {(s.answer as AskResult['answer']).claims?.map((c, i) => (
                  <p key={i}>{c.text}</p>
                ))}
              </div>
            </details>
          ))}
        </>
      )}
    </>
  );
}

export function ProviderSettings({ onNotice }: { onNotice: (s: string) => void }) {
  const [config, setConfig] = useState<ProviderConfig>({
      endpoint: 'http://127.0.0.1:11434/v1',
      model: '',
      configured: false,
      hasKey: false,
      isLocal: true,
    }),
    [key, setKey] = useState(''),
    [remote, setRemote] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (!DEMO)
      request<ProviderConfig>('/provider')
        .then(setConfig)
        .catch((e) => setError(e.message));
  }, []);
  if (DEMO) return <Install />;
  async function save(test = false) {
    setBusy(true);
    setError('');
    try {
      const saved = await request<ProviderConfig>(
        '/provider',
        {
          endpoint: config.endpoint,
          model: config.model,
          apiKey: key || undefined,
          allowRemote: remote,
        },
        'PUT',
      );
      setConfig(saved);
      setKey('');
      if (test)
        await request('/provider/test', { allowRemote: remote, expectedEndpoint: saved.endpoint });
      onNotice(test ? 'El modelo respondió a la prueba.' : 'Conexión guardada.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p className="muted">
        Conecta un endpoint de Ollama o un servicio compatible con OpenAI. La lectura del
        repositorio funciona sin modelo.
      </p>
      <label className="field">
        Dirección del servicio
        <input
          type="url"
          required
          value={config.endpoint}
          onChange={(e) => setConfig({ ...config, endpoint: e.target.value })}
        />
      </label>
      <label className="field">
        Modelo
        <input
          required
          placeholder="Nombre exacto del modelo instalado o disponible"
          value={config.model}
          onChange={(e) => setConfig({ ...config, model: e.target.value })}
        />
      </label>
      <label className="field">
        Clave de API, si el servicio la necesita
        <input
          type="password"
          autoComplete="off"
          placeholder={
            config.hasKey ? 'Clave disponible en esta sesión' : 'Opcional para modelos locales'
          }
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <small>Se conserva en la memoria del proceso de Trama.</small>
      </label>
      <label className="check-field">
        <input type="checkbox" checked={remote} onChange={(e) => setRemote(e.target.checked)} />
        Permitir esta conexión a un servicio fuera de mi equipo
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <Button disabled={busy} type="submit" primary>
          {busy ? <Loader2 size={14} className="spin" /> : <Check size={14} />}Guardar conexión
        </Button>
        <Button disabled={busy || !config.model} onClick={() => save(true)}>
          Probar conexión
        </Button>
      </div>
      <p className="footnote">
        El proveedor determina dónde se ejecuta el modelo y su coste, incluso si su endpoint está en
        tu equipo. Antes de enviar código, cada consulta pide tu autorización.
      </p>
    </form>
  );
}

export function Tutor({
  snapshot,
  processId,
  learning,
  onChange,
  onSource,
}: StudyProps & Sources & { processId?: string }) {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [question, setQuestion] = useState(
    'Explica este proceso paso a paso. Sigue los valores, señala sus supuestos y dame un ejemplo concreto.',
  );
  const [provider, setProvider] = useState<ProviderConfig | null>(null),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<AskResult | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    request<ProviderConfig>('/provider')
      .then(setProvider)
      .catch((e) => setError(e.message));
  }, []);
  async function ask() {
    setBusy(true);
    setError('');
    try {
      const answer = await request<AskResult>('/snapshots/' + snapshot.id + '/ask', {
        question,
        processId,
        allowRemote: consent,
        expectedEndpoint: provider?.endpoint,
      });
      if (!mounted.current) return;
      setResult(answer);
      onChange({
        ...learning,
        sessions: [
          ...(learning.sessions || []),
          {
            id: crypto.randomUUID(),
            question,
            answer: answer.answer,
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (DEMO)
    return (
      <>
        <p>
          Conecta tu modelo en la aplicación local para profundizar en el código. Los ejemplos y la
          práctica están disponibles aquí.
        </p>
        <Install />
      </>
    );
  return (
    <>
      <label className="field">
        Qué necesitas conectar
        <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
      </label>
      {provider && !provider.configured && (
        <p className="hint">Configura un modelo en el botón de ajustes de la barra superior.</p>
      )}
      {provider && !provider.isLocal && (
        <label className="check-field">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          Enviar la pregunta y los fragmentos relevantes de esta captura a{' '}
          {new URL(provider.endpoint).host}
        </label>
      )}
      <Button
        primary
        disabled={
          busy || !question.trim() || !provider?.configured || (!provider.isLocal && !consent)
        }
        onClick={ask}
      >
        {busy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}Explicar con mi
        modelo
      </Button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className="tutor-answer">
          <p>{result.answer.summary}</p>
          {result.answer.claims.map((claim, i) => (
            <section key={i}>
              <Pill status={claim.status} />
              <p>{claim.text}</p>
              {claim.sources.map((a, j) => (
                <Citation key={j} anchor={a} onClick={onSource} />
              ))}
            </section>
          ))}
          {result.answer.example && (
            <section>
              <h3>{result.answer.example.title}</h3>
              <p>{result.answer.example.description}</p>
              <div className="example-io">
                <div>
                  <small>Entrada ilustrativa</small>
                  <pre>{result.answer.example.input}</pre>
                </div>
                <ArrowRight size={15} />
                <div>
                  <small>Resultado propuesto</small>
                  <pre>{result.answer.example.output}</pre>
                </div>
              </div>
            </section>
          )}
          <p className="next-question">{result.answer.nextQuestion}</p>
          <p className="footnote">
            {result.model} · {result.context.files.length} archivos usados. Se comprobaron las
            ubicaciones de las citas. La explicación generada requiere contrastar sus afirmaciones.
          </p>
        </div>
      )}
    </>
  );
}

export function Revisions({
  snapshot,
  onOpen,
  onRefresh,
}: {
  snapshot: Snapshot;
  onOpen: (id: string) => void;
  onRefresh: () => void;
}) {
  const [items, setItems] = useState<Snapshot[]>([]),
    [diff, setDiff] = useState<{ added: unknown[]; removed: unknown[]; changed: unknown[] } | null>(
      null,
    ),
    [error, setError] = useState('');
  useEffect(() => {
    request<Snapshot[]>('/projects/' + snapshot.projectId + '/snapshots')
      .then(setItems)
      .catch((e) => setError(e.message));
  }, [snapshot.projectId]);
  async function compare(id: string) {
    try {
      setDiff(await request('/snapshots/' + snapshot.id + '/compare', { otherId: id }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const pathOf = (x: unknown) => (typeof x === 'string' ? x : (x as { path: string }).path);
  return (
    <>
      <p>Una nueva lectura conserva las fuentes y el cuaderno de las revisiones anteriores.</p>
      {!DEMO && (
        <Button primary onClick={onRefresh}>
          <RefreshCw size={14} />
          Actualizar desde el proyecto
        </Button>
      )}
      {error && <p className="error">{error}</p>}
      <div className="revision-list">
        {items.map((s) => (
          <div key={s.id}>
            <span>
              <code>{s.revision?.slice(0, 12)}</code>
              <small>{new Date(s.createdAt).toLocaleString('es')}</small>
            </span>
            {s.id === snapshot.id ? (
              <span className="pill">Abierta</span>
            ) : (
              <>
                <button className="text-button" onClick={() => compare(s.id)}>
                  Comparar
                </button>
                <Button onClick={() => onOpen(s.id)}>Abrir</Button>
              </>
            )}
          </div>
        ))}
      </div>
      {diff && (
        <div className="comparison">
          {(['added', 'removed', 'changed'] as const).map((key) => (
            <section key={key}>
              <h3>
                {{ added: 'Añadidos', removed: 'Eliminados', changed: 'Modificados' }[key]} ·{' '}
                {diff[key].length}
              </h3>
              {diff[key].map((v, i) => (
                <code key={i}>{pathOf(v)}</code>
              ))}
            </section>
          ))}
          <p className="footnote">
            Los apuntes de cada revisión conservan sus fuentes. Revisa las explicaciones que
            dependan de archivos modificados.
          </p>
        </div>
      )}
    </>
  );
}
