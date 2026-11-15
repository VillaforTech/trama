import CommandPalette from './CommandPalette';
import LibraryHome from './LibraryHome';
import './workbench.css';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Download,
  FolderOpen,
  Github,
  Layers,
  Loader2,
  LockKeyhole,
  Plus,
  Search,
  Upload,
  X,
  Trash2,
} from 'lucide-react';
import { api, DEMO, download, request } from './api';
import type {
  Anchor,
  ImportRequest,
  Job,
  Learning,
  ProjectSummary,
  Snapshot,
  Unit,
} from '../shared/types';
import { Button, Citation, Empty, Install, Modal, REPO, SourcePanel } from './components';
import {
  Reader,
  Practice,
  Notebook,
  Explorer,
  MapView,
  ProviderSettings,
  Tutor,
  Revisions,
} from './Workspace';

type View = 'overview' | 'read' | 'map' | 'files' | 'practice' | 'notebook';
type Example = { id: string; name: string; description: string };
const examples: Example[] = [
  {
    id: 'pedidos',
    name: 'Un pedido, de principio a fin',
    description: 'Una API, una transacción y un evento que puede repetirse.',
  },
  {
    id: 'data-pipeline',
    name: 'Del CSV al informe',
    description: 'Sigue una cifra hasta su origen y cambia una regla de cálculo.',
  },
];
export default function App() {
  const desktop = window.tramaDesktop;
  const [commandOpen, setCommandOpen] = useState(false);
  const [outlineHidden, setOutlineHidden] = useState(false);
  const [featureQuery, setFeatureQuery] = useState('');
  const [featureLimit, setFeatureLimit] = useState(12);
  const [mapPaths, setMapPaths] = useState<string[] | undefined>();
  const projectMenu = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !projectMenu.current?.contains(event.target))
        projectMenu.current?.removeAttribute('open');
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') projectMenu.current?.removeAttribute('open');
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  const [projects, setProjects] = useState<ProjectSummary[]>([]),
    [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [learning, setLearning] = useState<Learning>({});
  const [saveIssue, setSaveIssue] = useState(false);
  const drafts = useRef<Record<string, { value: Learning; version: number }>>({});
  const pendingSaves = useRef(0);
  try {
    if (!Object.keys(drafts.current).length)
      drafts.current = JSON.parse(sessionStorage.getItem('trama-drafts-v1') || '{}');
  } catch {}
  const writeDrafts = () => {
    try {
      sessionStorage.setItem('trama-drafts-v1', JSON.stringify(drafts.current));
    } catch {}
  };
  const [view, setView] = useState<View>('overview'),
    [unitId, setUnitId] = useState(''),
    [processId, setProcessId] = useState(''),
    [stepIndex, setStepIndex] = useState(0);
  const [source, setSource] = useState<Anchor | null>(null),
    [dialog, setDialog] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [job, setJob] = useState<Job | null>(null),
    [saving, setSaving] = useState(false);
  const [importKind, setImportKind] = useState<'local' | 'github'>('local'),
    [importValue, setImportValue] = useState(''),
    [token, setToken] = useState(''),
    [extraToken, setExtraToken] = useState(false),
    [menu, setMenu] = useState(false);
  const saveQueue = useRef(Promise.resolve()),
    version = useRef(0),
    learningRef = useRef<Learning>({}),
    snapshotRef = useRef<Snapshot | null>(null),
    requestEpoch = useRef(0),
    saveFailed = useRef(false),
    backupInput = useRef<HTMLInputElement>(null);
  const notify = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(''), 3800);
  };
  async function refreshProjects() {
    setProjects(await api.projects());
  }
  function setPosition(s: Snapshot) {
    const p = s.learning.position;
    setView((p?.view as View) || 'overview');
    setUnitId(p?.unit || '');
    setProcessId(p?.process || '');
    setStepIndex(p?.step || 0);
  }
  async function openSnapshot(id: string, fromHistory = false) {
    const epoch = ++requestEpoch.current;
    await saveQueue.current;
    const value = await api.snapshot(id);
    if (epoch !== requestEpoch.current) return;
    const draft = drafts.current[id];
    const draftConflict = !!draft && draft.version !== value.learningVersion;
    if (draft) value.learning = draft.value;
    snapshotRef.current = value;
    learningRef.current = value.learning;
    version.current = value.learningVersion;
    saveFailed.current = draftConflict;
    setSaveIssue(!!draft);
    setSnapshot(value);
    setFeatureQuery('');
    setFeatureLimit(12);
    setMapPaths(undefined);
    setLearning(value.learning);
    setPosition(value);
    setSource(null);
    setError(
      draftConflict
        ? 'Hay un borrador recuperado y otra versión guardada. Descarga tu borrador antes de abrir la versión guardada.'
        : draft
          ? 'Borrador recuperado. Tu siguiente edición lo guardará.'
          : '',
    );
    setDialog('');
    setMenu(false);
    setJob(null);
    if (!fromHistory) history.pushState(null, '', '#project=' + encodeURIComponent(id));
    await refreshProjects();
  }
  useEffect(() => {
    refreshProjects().catch((e) => setError(e.message));
    const sync = () => {
      const id = new URLSearchParams(location.hash.slice(1)).get('project');
      if (id) openSnapshot(id, true).catch((e) => setError(e.message));
      else {
        requestEpoch.current++;
        snapshotRef.current = null;
        setSnapshot(null);
        setMenu(false);
      }
    };
    sync();
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
  }, []);
  function updateLearning(next: Learning) {
    const s = snapshotRef.current;
    if (!s || s.id !== snapshot?.id) return;
    learningRef.current = next;
    setLearning(next);
    setSaving(true);
    pendingSaves.current++;
    drafts.current[s.id] = { value: next, version: version.current };
    writeDrafts();
    saveQueue.current = saveQueue.current
      .then(async () => {
        if (saveFailed.current) return;
        try {
          const saved = await api.save(s.id, next, version.current);
          version.current = saved.version;
          if (JSON.stringify(drafts.current[s.id]?.value) === JSON.stringify(next)) {
            delete drafts.current[s.id];
            if (snapshotRef.current?.id === s.id) setSaveIssue(false);
          } else if (drafts.current[s.id]) drafts.current[s.id].version = saved.version;
          writeDrafts();
        } catch (e) {
          saveFailed.current = true;
          setSaveIssue(true);
          setError(
            (e as Error).message + ' Tu borrador sigue abierto. Descárgalo antes de recargar.',
          );
        }
      })
      .finally(() => {
        pendingSaves.current--;
        setSaving(pendingSaves.current > 0);
      });
  }
  function changeView(next: View, unit = unitId, process = processId, index = stepIndex) {
    setView(next);
    if (next !== 'map') setMapPaths(undefined);
    setUnitId(unit);
    setProcessId(process);
    setStepIndex(index);
    setSource(null);
    setMenu(false);
    updateLearning({
      ...learningRef.current,
      position: { view: next, unit, process, step: index },
    });
  }
  function goHome() {
    requestEpoch.current++;
    snapshotRef.current = null;
    setSnapshot(null);
    setSource(null);
    setMenu(false);
    history.pushState(null, '', '#');
    refreshProjects().catch((e) => setError(e.message));
  }
  function study(unit: Unit) {
    if (!unit.processes.length) return;
    changeView('read', unit.id, unit.processes[0].id, 0);
  }
  async function runJob(start: () => Promise<{ jobId: string }>) {
    setError('');
    setDialog('');
    setToken('');
    setJob({ id: 'pending', status: 'running', phase: 'Abriendo el proyecto…', progress: 0 });
    try {
      const { jobId } = await start();
      let current = await api.job(jobId);
      setJob(current);
      while (current.status === 'running') {
        await new Promise((r) => setTimeout(r, 500));
        current = await api.job(jobId);
        setJob(current);
      }
      if (current.status === 'failed')
        throw new Error(current.error || 'No se pudo abrir el proyecto.');
      if (current.snapshotId) await openSnapshot(current.snapshotId);
    } catch (e) {
      setError((e as Error).message);
      setJob(null);
    }
  }
  async function openFolder() {
    if (DEMO) {
      setDialog('install');
      return;
    }
    if (!desktop) {
      setDialog('import');
      return;
    }
    try {
      const folder = await desktop.selectFolder();
      if (folder) runJob(() => api.import({ kind: 'local', path: folder }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', key);
    const stopOpen = desktop?.onOpenFolder((path) =>
      runJob(() => api.import({ kind: 'local', path })),
    );
    const stopNavigate = desktop?.onNavigate((target) => {
      if (target === 'search') setCommandOpen(true);
      else setDialog(target === 'settings' ? 'settings' : 'library');
    });
    return () => {
      window.removeEventListener('keydown', key);
      stopOpen?.();
      stopNavigate?.();
    };
  }, []);
  function doImport() {
    const value = importValue.trim();
    if (!value) return;
    const req: ImportRequest =
      importKind === 'local'
        ? { kind: 'local', path: value }
        : { kind: 'github', repo: value, token: token.trim() || undefined };
    runJob(() => api.import(req));
  }
  async function exportNotebook() {
    if (!snapshot) return;
    await saveQueue.current;
    const value = await request<{ snapshot: Snapshot }>('/snapshots/' + snapshot.id + '/export');
    value.snapshot.learning = learningRef.current;
    download(value, 'trama-' + snapshot.name + '-' + snapshot.revision.slice(0, 8) + '.json');

    notify('Copia descargada. Incluye las fuentes de esta revisión.');
  }
  const activeUnit = snapshot?.plan.features.find((x) => x.id === unitId);
  const activeProcess = activeUnit?.processes.find((x) => x.id === processId);
  const nav = [
    { id: 'overview', title: 'Recorrido' },
    { id: 'map', title: 'Conexiones de código' },
    { id: 'files', title: 'Código y fuentes' },
    { id: 'practice', title: 'Practicar' },
    { id: 'notebook', title: 'Mi cuaderno' },
  ] as const;
  const featureMatches = (snapshot?.plan.features || []).filter((feature) =>
    [feature.title, feature.description, ...feature.sources.map((source) => source.path)]
      .join(' ')
      .toLocaleLowerCase()
      .includes(featureQuery.toLocaleLowerCase().trim()),
  );
  const suggestedFeature =
    snapshot?.plan.features.find(
      (feature) =>
        feature.processes.length &&
        feature.sources.some((source) =>
          /route|controller|handler|main|pipeline|app\./i.test(source.path),
        ),
    ) || snapshot?.plan.features.find((feature) => feature.processes.length);
  const resumable = activeUnit && activeProcess && snapshot?.learning.position?.view === 'read';
  const feedback = (err: unknown) => setError((err as Error).message);
  return (
    <div
      className={
        'app ' +
        (desktop ? 'native-desktop ' : '') +
        (snapshot ? 'has-project' : 'library-app') +
        (outlineHidden ? ' outline-hidden' : '') +
        (source ? ' source-open' : '')
      }
    >
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="app-header">
        <div className="window-leading">
          <button className="brand" onClick={goHome} aria-label="Trama, inicio">
            Trama
          </button>
          {snapshot && (
            <button className="library-back" onClick={goHome}>
              Biblioteca
            </button>
          )}
        </div>
        {snapshot && (
          <button className="window-project" onClick={() => setDialog('library')}>
            <span>{snapshot.name}</span>
            <ChevronDown size={12} />
          </button>
        )}
        <div className="header-actions">
          <button
            className="command-trigger"
            aria-label="Buscar acciones y archivos"
            onClick={() => setCommandOpen(true)}
          >
            <Search size={14} />
            <span>Buscar</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="toolbar-text"
            aria-label="Configurar modelo"
            onClick={() => setDialog('settings')}
          >
            Ajustes
          </button>
          {DEMO && <Button onClick={() => setDialog('install')}>Instalar</Button>}
        </div>
      </header>
      {snapshot && (
        <>
          <div className="workspace-toolbar">
            <div className="outline-control">
              <button
                onClick={() => setOutlineHidden(!outlineHidden)}
                aria-expanded={!outlineHidden}
              >
                {outlineHidden ? 'Mostrar índice' : 'Ocultar índice'}
              </button>
            </div>
            <nav className="workspace-tabs" aria-label="Proyecto">
              {nav.map((item) => (
                <button
                  key={item.id}
                  aria-current={
                    view === item.id || (view === 'read' && item.id === 'overview')
                      ? 'page'
                      : undefined
                  }
                  className={
                    view === item.id || (view === 'read' && item.id === 'overview') ? 'active' : ''
                  }
                  onClick={() => changeView(item.id)}
                >
                  {item.title}
                </button>
              ))}
            </nav>
            <details className="project-actions" ref={projectMenu}>
              <summary>
                Proyecto <ChevronDown size={12} />
              </summary>
              <div className="project-actions-menu">
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    setDialog('versions');
                  }}
                >
                  Revisiones
                </button>
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    void exportNotebook();
                  }}
                >
                  Descargar cuaderno
                </button>
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    setDialog('scope');
                  }}
                >
                  Alcance de la lectura
                </button>
                <hr />
                <button
                  onClick={(e) => {
                    e.currentTarget.closest('details')?.removeAttribute('open');
                    setDialog('import');
                  }}
                >
                  Abrir otro proyecto
                </button>
              </div>
            </details>
          </div>
          <aside
            className={'sidebar project-outline ' + (menu ? 'open' : '')}
            aria-label="Índice del repositorio"
          >
            <div className="outline-heading">
              <span>Índice del repositorio</span>
              <span>{snapshot.plan.features.length}</span>
            </div>
            <button
              className={'outline-overview ' + (view === 'overview' ? 'selected' : '')}
              onClick={() => changeView('overview')}
            >
              Visión general
            </button>
            <label className="outline-search">
              Filtrar funcionalidades
              <input
                type="search"
                aria-label="Filtrar funcionalidades"
                value={featureQuery}
                onChange={(event) => {
                  setFeatureQuery(event.target.value);
                  setFeatureLimit(12);
                }}
                placeholder="Nombre o archivo…"
              />
            </label>
            <div className="outline-section-title">Funcionalidades</div>
            <div className="outline-items">
              {featureMatches.slice(0, featureLimit).map((feature) => (
                <div className="outline-group" key={feature.id}>
                  <button
                    className={
                      'outline-feature ' +
                      (activeUnit?.id === feature.id && view === 'read' ? 'selected' : '')
                    }
                    onClick={() => study(feature)}
                    title={feature.title}
                  >
                    <ChevronDown
                      size={12}
                      className={activeUnit?.id === feature.id ? 'expanded' : ''}
                    />
                    <span>{feature.title}</span>
                  </button>
                  {activeUnit?.id === feature.id &&
                    feature.processes.map((process) => (
                      <button
                        className={
                          'outline-process ' +
                          (processId === process.id && view === 'read' ? 'current' : '')
                        }
                        key={process.id}
                        onClick={() => changeView('read', feature.id, process.id, 0)}
                      >
                        <span>{process.title}</span>
                      </button>
                    ))}
                </div>
              ))}
              {featureLimit < featureMatches.length && (
                <button className="outline-more" onClick={() => setFeatureLimit(featureLimit + 12)}>
                  Mostrar más ({featureMatches.length - featureLimit})
                </button>
              )}
              {!featureMatches.length && (
                <p className="outline-empty">Sin coincidencias. Prueba otro archivo.</p>
              )}
            </div>
            <div className="outline-status">
              <button onClick={() => setDialog('scope')}>
                {snapshot.files.length} archivos · {snapshot.revision.slice(0, 7)}
              </button>
              <span role="status">
                {saveIssue
                  ? 'Borrador pendiente de guardar'
                  : saving
                    ? 'Guardando…'
                    : 'Cuaderno guardado localmente'}
              </span>
            </div>
          </aside>
        </>
      )}
      <main id="main" className={snapshot ? 'workspace' : 'home'}>
        {snapshot && (
          <div className="mobile-nav">
            <Button onClick={() => setMenu(!menu)}>
              <Layers size={15} />
              Proyecto
            </Button>
            <span>{snapshot.name}</span>
          </div>
        )}
        {error && (
          <div className="error-banner" role="alert">
            <span>
              {error}
              {saveIssue && snapshot && (
                <button
                  className="text-button"
                  onClick={async () => {
                    await exportNotebook();
                    delete drafts.current[snapshot.id];
                    writeDrafts();
                    await openSnapshot(snapshot.id);
                  }}
                >
                  Descargar borrador y recuperar versión guardada
                </button>
              )}
            </span>
            <button aria-label="Cerrar aviso" onClick={() => setError('')}>
              <X size={16} />
            </button>
          </div>
        )}
        {job ? (
          <section className="job-screen">
            <Loader2 className="spin" size={32} />
            <h1>Construyendo tu recorrido</h1>
            <p role="status">{job.phase}</p>
            <progress max="100" value={job.progress} />
            <p className="muted">Leyendo archivos y conectando las piezas de tu proyecto.</p>
          </section>
        ) : !snapshot ? (
          <LibraryHome
            projects={projects}
            demo={DEMO}
            onOpen={(id) => {
              void openSnapshot(id).catch(feedback);
            }}
            onOpenFolder={() => {
              void openFolder();
            }}
            onGitHub={() => {
              setImportKind('github');
              setDialog('import');
            }}
            onRestore={() => backupInput.current?.click()}
            onExample={(id) => {
              void runJob(() => api.import({ kind: 'example', example: id }));
            }}
          />
        ) : (
          <>
            {view === 'overview' && (
              <>
                <div className="page-heading">
                  <div className="breadcrumb">
                    <FolderOpen size={14} />
                    {snapshot.name}
                    <span>/</span>Recorrido
                  </div>
                  <h1>Visión general</h1>
                  <p className="page-description">{snapshot.plan.summary}</p>
                  {snapshot.plan.summarySource && (
                    <Citation
                      anchor={snapshot.plan.summarySource}
                      onClick={setSource}
                      label="Descripción del proyecto"
                    />
                  )}
                </div>
                <section className="next-reading" aria-labelledby="next-reading-title">
                  <div>
                    <h2 id="next-reading-title">
                      {resumable ? 'Continúa tu investigación' : 'Empieza por un comportamiento'}
                    </h2>
                    <p>
                      {resumable
                        ? activeProcess.title
                        : suggestedFeature?.title || 'Explora las conexiones del proyecto'}
                      .
                    </p>
                    <ol>
                      <li>Elige qué ocurre y escribe tu predicción.</li>
                      <li>Sigue el recorrido y abre las líneas que lo justifican.</li>
                      <li>Resuelve una variante en Practicar y conserva tu explicación.</li>
                    </ol>
                  </div>
                  <div className="next-reading-actions">
                    {(resumable || suggestedFeature) && (
                      <Button
                        primary
                        onClick={() => (resumable ? changeView('read') : study(suggestedFeature!))}
                      >
                        {resumable ? 'Retomar mi lectura' : 'Empezar el recorrido'}{' '}
                        <ArrowRight size={14} />
                      </Button>
                    )}
                    <button className="text-button" onClick={() => changeView('map')}>
                      Ver conexiones del sistema
                    </button>
                    <small>La lectura y la práctica funcionan sin conectar IA.</small>
                  </div>
                </section>
                <div className="overview-layout">
                  <section>
                    <div className="section-title">
                      <h2>Las piezas del sistema</h2>
                      <button className="text-button" onClick={() => changeView('map')}>
                        Abrir el mapa <ArrowUpRight size={13} />
                      </button>
                    </div>
                    <div className="architecture-list">
                      {snapshot.plan.architecture.map((unit, i) => (
                        <details key={unit.id}>
                          <summary>
                            <span>{unit.title}</span>
                            <ChevronDown size={15} />
                          </summary>
                          <div className="unit-detail">
                            <p>{unit.description}</p>
                            {unit.sources.slice(0, 2).map((a, j) => (
                              <Citation key={j} anchor={a} onClick={setSource} />
                            ))}
                            {unit.related.length > 0 && (
                              <p className="muted">
                                Conecta con {unit.related.map((r) => r.title).join(', ')}.
                              </p>
                            )}
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                  <section className="scope-note">
                    <span className="mini-icon">
                      <Layers size={18} />
                    </span>
                    <h3>Una revisión para estudiar</h3>
                    <p>
                      {snapshot.coverage.indexed} archivos disponibles en esta captura. Las
                      referencias conservan sus líneas aunque el proyecto cambie después.
                    </p>
                    <button className="text-button" onClick={() => setDialog('scope')}>
                      Ver alcance de la lectura <ArrowRight size={13} />
                    </button>
                  </section>
                </div>
                <section className="feature-section">
                  <div className="section-title">
                    <h2>Elige qué quieres entender</h2>
                    <span>Funcionalidades y procesos sugeridos</span>
                  </div>
                  <label className="feature-search">
                    Buscar una funcionalidad o un archivo
                    <input
                      type="search"
                      placeholder="Por ejemplo: pedidos, autenticación o src/routes…"
                      value={featureQuery}
                      onChange={(event) => {
                        setFeatureQuery(event.target.value);
                        setFeatureLimit(12);
                      }}
                    />
                  </label>
                  <div className="features">
                    {featureMatches.slice(0, featureLimit).map((f) => (
                      <button key={f.id} onClick={() => study(f)} className="feature-row">
                        <span>
                          <b>{f.title}</b>
                          <small>
                            {f.processes.length} procesos ·{' '}
                            {f.sources[0]?.path || 'Fuentes del proyecto'}
                          </small>
                        </span>
                        <ArrowRight size={17} />
                      </button>
                    ))}
                  </div>
                  {!featureMatches.length && (
                    <p className="feature-empty">
                      No hay funcionalidades con ese nombre. Busca en Código y fuentes para
                      localizar otra entrada.
                    </p>
                  )}
                  <div className="feature-results">
                    <span>
                      {Math.min(featureLimit, featureMatches.length)} de {featureMatches.length}{' '}
                      funcionalidades sugeridas
                    </span>
                    {featureLimit < featureMatches.length && (
                      <button
                        className="text-button"
                        onClick={() => setFeatureLimit(featureLimit + 12)}
                      >
                        Mostrar 12 más
                      </button>
                    )}
                  </div>
                </section>
              </>
            )}
            {view === 'read' &&
              (activeUnit && activeProcess ? (
                <Reader
                  key={snapshot.id}
                  snapshot={snapshot}
                  unit={activeUnit}
                  process={activeProcess}
                  stepIndex={stepIndex}
                  learning={learning}
                  onChange={updateLearning}
                  onStep={(i) => changeView('read', unitId, processId, i)}
                  onProcess={(id) => changeView('read', unitId, id, 0)}
                  onSource={setSource}
                  onMap={() => {
                    const paths = [
                      ...new Set(
                        [
                          ...activeProcess.sources,
                          ...activeProcess.steps.flatMap((step) => step.sources),
                        ].map((anchor) => anchor.path),
                      ),
                    ];
                    changeView('map');
                    setMapPaths(paths);
                  }}
                  onTutor={() => setDialog('tutor')}
                  onPractice={() => changeView('practice')}
                />
              ) : (
                <Empty title="Elige una funcionalidad">
                  Vuelve al recorrido para abrir un proceso y empezar a seguirlo.
                </Empty>
              ))}
            {view === 'map' && (
              <MapView
                key={snapshot.id}
                snapshot={snapshot}
                onSource={setSource}
                initialPaths={mapPaths}
              />
            )}
            {view === 'files' && (
              <Explorer key={snapshot.id} snapshot={snapshot} onSource={setSource} />
            )}
            {view === 'practice' && (
              <Practice
                openSource={source}
                key={snapshot.id}
                snapshot={snapshot}
                learning={learning}
                onChange={updateLearning}
                onSource={setSource}
              />
            )}
            {view === 'notebook' && (
              <Notebook
                key={snapshot.id}
                snapshot={snapshot}
                learning={learning}
                onChange={updateLearning}
                onResume={() => changeView('read')}
                onExport={exportNotebook}
              />
            )}
          </>
        )}
      </main>
      <input
        type="file"
        accept=".json"
        ref={backupInput}
        hidden
        onChange={async (e) => {
          try {
            const f = e.target.files?.[0];
            if (!f) return;
            if (f.size > 45 * 1024 * 1024) throw new Error('La copia supera 45 MB.');
            const r = await request<{ snapshotId: string }>('/restore', JSON.parse(await f.text()));
            await openSnapshot(r.snapshotId);
            notify('Cuaderno restaurado.');
          } catch (e) {
            feedback(e);
          } finally {
            if (backupInput.current) backupInput.current.value = '';
          }
        }}
      />
      {notice && (
        <div className="toast" role="status">
          <Check size={15} />
          {notice}
        </div>
      )}
      {source && snapshot && (
        <SourcePanel snapshot={snapshot} anchor={source} onClose={() => setSource(null)} />
      )}
      {dialog === 'install' && (
        <Modal title="Tu código, en tu equipo" onClose={() => setDialog('')}>
          <Install />
        </Modal>
      )}
      {dialog === 'import' && (
        <Modal
          title="Abrir un proyecto"
          onClose={() => {
            setDialog('');
            setToken('');
          }}
        >
          {DEMO ? (
            <Install />
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                doImport();
              }}
            >
              <div className="tabs">
                <button
                  type="button"
                  className={importKind === 'local' ? 'active' : ''}
                  onClick={() => {
                    setImportKind('local');
                    setImportValue('');
                  }}
                >
                  <FolderOpen size={15} />
                  Carpeta local
                </button>
                <button
                  type="button"
                  className={importKind === 'github' ? 'active' : ''}
                  onClick={() => {
                    setImportKind('github');
                    setImportValue('');
                  }}
                >
                  <Github size={15} />
                  GitHub
                </button>
              </div>
              <p className="muted">
                {importKind === 'local'
                  ? 'Abre la carpeta de un repositorio que ya tengas clonado.'
                  : 'Usa la URL de un repositorio. Trama puede usar tu sesión de GitHub CLI para leer repositorios privados.'}
              </p>
              {desktop && importKind === 'local' && (
                <Button
                  onClick={async () => {
                    try {
                      const selected = await desktop.selectFolder();
                      if (selected) setImportValue(selected);
                    } catch (e) {
                      setError((e as Error).message);
                    }
                  }}
                >
                  <FolderOpen size={15} />
                  Seleccionar carpeta…
                </Button>
              )}
              <label className="field">
                {importKind === 'local' ? 'Ruta completa de la carpeta' : 'Repositorio'}
                <input
                  required
                  autoFocus
                  value={importValue}
                  onChange={(e) => setImportValue(e.target.value)}
                  placeholder={
                    importKind === 'local'
                      ? '/ruta/a/mi-proyecto'
                      : 'https://github.com/equipo/proyecto'
                  }
                  autoComplete="off"
                />
              </label>
              {importKind === 'github' && (
                <>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setExtraToken(!extraToken)}
                  >
                    Usar un token de lectura <ChevronDown size={13} />
                  </button>
                  {extraToken && (
                    <label className="field">
                      Token personal
                      <input
                        type="password"
                        autoComplete="off"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                      <small>Se usa para esta importación. Permiso Contents de sólo lectura.</small>
                    </label>
                  )}
                </>
              )}
              <div className="privacy-note">
                <LockKeyhole size={15} />
                <span>
                  Las fuentes se guardan en tu equipo. La conexión a un modelo se configura por
                  separado.
                </span>
              </div>
              <Button primary type="submit">
                Crear mi recorrido <ArrowRight size={15} />
              </Button>
            </form>
          )}
          <div className="modal-examples">
            <small>También puedes explorar</small>
            {examples.map((e) => (
              <button
                key={e.id}
                className="text-button"
                onClick={() => runJob(() => api.import({ kind: 'example', example: e.id }))}
              >
                {e.name}
                <ArrowUpRight size={13} />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {dialog === 'library' && (
        <Modal title="Tu biblioteca" onClose={() => setDialog('')}>
          {projects.map((p) => (
            <div className="library-row" key={p.id}>
              <button
                className="project-row"
                onClick={() => openSnapshot(p.latestSnapshotId).catch(feedback)}
              >
                <FolderOpen size={18} />
                <span>
                  <b>{p.name}</b>
                  <small>{p.fileCount} archivos</small>
                </span>
                <ArrowRight size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={'Eliminar ' + p.name}
                onClick={async () => {
                  if (
                    !confirm(
                      '¿Eliminar las capturas y el cuaderno de ' +
                        p.name +
                        ' de Trama? Los archivos originales permanecen en su carpeta.',
                    )
                  )
                    return;
                  try {
                    await request('/projects/' + p.id, undefined, 'DELETE');
                    await refreshProjects();
                    if (snapshot?.projectId === p.id) goHome();
                    notify('Proyecto retirado de Trama.');
                  } catch (e) {
                    feedback(e);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <Button onClick={() => setDialog('import')}>
            <Plus size={15} />
            Abrir proyecto
          </Button>
          <button className="text-button" onClick={() => backupInput.current?.click()}>
            <Upload size={14} />
            Restaurar copia
          </button>
        </Modal>
      )}
      {dialog === 'settings' && (
        <Modal title="Ajustes de Trama" onClose={() => setDialog('')}>
          <ProviderSettings onNotice={notify} />
        </Modal>
      )}
      {dialog === 'tutor' && snapshot && (
        <Modal title="Profundizar en este proceso" onClose={() => setDialog('')} wide>
          <Tutor
            key={snapshot.id}
            snapshot={snapshot}
            processId={processId}
            learning={learning}
            onChange={updateLearning}
            onSource={(a) => {
              setDialog('');
              setSource(a);
            }}
          />
        </Modal>
      )}
      {dialog === 'versions' && snapshot && (
        <Modal title="Revisiones del proyecto" onClose={() => setDialog('')} wide>
          <Revisions
            snapshot={snapshot}
            onOpen={(id) => openSnapshot(id).catch(feedback)}
            onRefresh={() =>
              runJob(() => request('/projects/' + snapshot.projectId + '/refresh', {}))
            }
          />
        </Modal>
      )}
      {dialog === 'scope' && snapshot && (
        <Modal title="Alcance de esta lectura" onClose={() => setDialog('')}>
          <p>
            {snapshot.coverage.indexed} archivos indexados · {snapshot.coverage.skipped} omitidos ·{' '}
            {(snapshot.coverage.bytes / 1024).toFixed(0)} KB de texto.
          </p>
          <ul>
            {snapshot.coverage.limitations.map((v, i) => (
              <li key={i}>{v}</li>
            ))}
          </ul>
          <p>
            Las agrupaciones son propuestas a partir de declaraciones y nombres. Una relación de
            importación muestra una dependencia escrita. El orden de ejecución y los efectos
            externos necesitan pruebas adicionales.
          </p>
          <code className="revision">{snapshot.revision}</code>
        </Modal>
      )}
      {commandOpen && (
        <CommandPalette
          snapshot={snapshot || undefined}
          onOpenSource={setSource}
          onClose={() => setCommandOpen(false)}
          commands={[
            { id: 'open', title: 'Abrir una carpeta', detail: '⌘ O', run: openFolder },
            { id: 'library', title: 'Ir a mi biblioteca', run: goHome },
            {
              id: 'model',
              title: 'Configurar mi modelo',
              detail: '⌘ ,',
              run: () => setDialog('settings'),
            },
            ...(snapshot
              ? nav.map((n) => ({ id: n.id, title: n.title, run: () => changeView(n.id) }))
              : []),
            ...projects.map((p) => ({
              id: p.id,
              title: p.name,
              detail: 'Abrir proyecto',
              run: () => openSnapshot(p.latestSnapshotId).catch(feedback),
            })),
          ]}
        />
      )}
    </div>
  );
}
