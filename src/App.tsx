import CommandPalette from './CommandPalette';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Boxes,
  Check,
  ChevronDown,
  Code2,
  Download,
  FileCode2,
  FolderOpen,
  GitBranch,
  Github,
  History,
  Layers,
  Loader2,
  LockKeyhole,
  Map,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sparkles,
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
import {
  Button,
  Citation,
  Empty,
  Install,
  Logo,
  Modal,
  Mode,
  REPO,
  SourcePanel,
} from './components';
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
    { id: 'overview', title: 'Recorrido', icon: BookOpen },
    { id: 'map', title: 'Conexiones de código', icon: Map },
    { id: 'files', title: 'Código y fuentes', icon: FileCode2 },
    { id: 'practice', title: 'Practicar', icon: Sparkles },
    { id: 'notebook', title: 'Mi cuaderno', icon: Layers },
  ] as const;
  const feedback = (err: unknown) => setError((err as Error).message);
  return (
    <div
      className={
        'app ' + (desktop ? 'native-desktop ' : '') + (snapshot ? 'has-project' : 'library-app')
      }
    >
      <a className="skip" href="#main">
        Saltar al contenido
      </a>
      <header className="app-header">
        <button className="brand" onClick={goHome} aria-label="Trama, inicio">
          <Logo />
        </button>
        <button className="command-trigger" onClick={() => setCommandOpen(true)}>
          <Search size={14} />
          <span>Buscar o ir a…</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="header-actions">
          <a className="text-button github-link" href={REPO} target="_blank" rel="noreferrer">
            <Github size={16} />
            <span>GitHub</span>
            <ArrowUpRight size={13} />
          </a>
          <button
            className="icon-button"
            aria-label="Configurar modelo"
            onClick={() => setDialog('settings')}
          >
            <Settings2 size={18} />
          </button>
          {DEMO && (
            <Button onClick={() => setDialog('install')}>
              Instalar <Download size={14} />
            </Button>
          )}
        </div>
      </header>
      {snapshot && (
        <aside className={'sidebar ' + (menu ? 'open' : '')}>
          <button className="project-switch" onClick={() => setDialog('library')}>
            <span className="project-monogram">{snapshot.name.slice(0, 1).toUpperCase()}</span>
            <span>
              <b>{snapshot.name}</b>
              <small>{snapshot.source === 'example' ? 'Proyecto de ejemplo' : 'Mi proyecto'}</small>
            </span>
            <ChevronDown size={14} />
          </button>
          <nav aria-label="Proyecto">
            {nav.map((item) => (
              <button
                key={item.id}
                className={
                  view === item.id || (view === 'read' && item.id === 'overview') ? 'active' : ''
                }
                onClick={() => changeView(item.id)}
              >
                <item.icon size={17} />
                {item.title}
              </button>
            ))}
          </nav>
          <div className="sidebar-route">
            <span>Tu lectura</span>
            {activeUnit ? (
              <button onClick={() => changeView('read')}>
                <GitBranch size={15} />
                <span>
                  {activeUnit.title}
                  <small>{activeProcess?.title}</small>
                </span>
                <ArrowRight size={13} />
              </button>
            ) : (
              <p>Elige una funcionalidad para entrar en el código.</p>
            )}
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setDialog('import')}>
              <Plus size={16} />
              Abrir otro proyecto
            </button>
            <button onClick={() => setDialog('versions')}>
              <History size={16} />
              Revisiones
            </button>
            <button onClick={exportNotebook}>
              <Download size={16} />
              Descargar cuaderno
            </button>
            <div className="snapshot-meta">
              <LockKeyhole size={13} />
              <span>
                {snapshot.files.length} archivos · <code>{snapshot.revision.slice(0, 7)}</code>
                <small>
                  {saveIssue
                    ? 'Borrador pendiente de guardar'
                    : saving
                      ? 'Guardando…'
                      : 'Cuaderno guardado localmente'}
                </small>
              </span>
            </div>
          </div>
        </aside>
      )}
      {!snapshot && (
        <aside className="sidebar home-sidebar">
          <div className="sidebar-label">Espacio personal</div>
          <nav aria-label="Biblioteca">
            <button className="active" onClick={goHome}>
              <BookOpen size={17} />
              Biblioteca
            </button>
            <button onClick={() => setCommandOpen(true)}>
              <Search size={17} />
              Buscar en Trama
            </button>
          </nav>
          <div className="sidebar-projects">
            <span>Proyectos</span>
            {projects.slice(0, 6).map((p) => (
              <button key={p.id} onClick={() => openSnapshot(p.latestSnapshotId).catch(feedback)}>
                <span className="repo-dot" />
                {p.name}
              </button>
            ))}
            <button onClick={openFolder}>
              <Plus size={14} />
              Abrir carpeta
            </button>
          </div>
          <div className="sidebar-bottom">
            <button onClick={() => setDialog('settings')}>
              <Settings2 size={16} />
              Conexión de IA
            </button>
            <a className="text-button" href={REPO} target="_blank" rel="noreferrer">
              <Github size={16} />
              Proyecto en GitHub
              <ArrowUpRight size={12} />
            </a>
            <div className="snapshot-meta">
              <LockKeyhole size={13} />
              <span>
                {DEMO ? 'Ejemplos públicos de aprendizaje' : 'Espacio local en este Mac'}
                <small>Trama · Código abierto</small>
              </span>
            </div>
          </div>
        </aside>
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
          <>
            <div className="library-heading">
              <div>
                <div className="breadcrumb">
                  Espacio personal <span>/</span> Biblioteca
                </div>
                <h1>Tu biblioteca</h1>
                <p>Un lugar para entender el software con el que trabajas.</p>
              </div>
              <div className="library-heading-actions">
                <Button
                  onClick={() => {
                    setImportKind('github');
                    setDialog('import');
                  }}
                >
                  <Github size={15} />
                  GitHub
                </Button>
                <Button primary onClick={openFolder}>
                  <FolderOpen size={15} />
                  {DEMO ? 'Descargar para Mac' : 'Abrir carpeta'}
                </Button>
              </div>
            </div>
            <section className="project-shelf">
              <div className="section-title">
                <h2>Proyectos recientes</h2>
                <button className="text-button" onClick={() => backupInput.current?.click()}>
                  <Upload size={13} />
                  Restaurar cuaderno
                </button>
              </div>
              {projects.length ? (
                projects.map((p) => (
                  <button
                    className="project-row"
                    key={p.id}
                    onClick={() => openSnapshot(p.latestSnapshotId).catch(feedback)}
                  >
                    <span className="icon-tile">
                      <FolderOpen size={18} />
                    </span>
                    <span>
                      <b>{p.name}</b>
                      <small>
                        {p.fileCount} archivos ·{' '}
                        {p.source === 'example' ? 'Ejemplo incluido' : 'Captura local'}
                      </small>
                    </span>
                    <span className="project-date">
                      {new Date(p.updatedAt).toLocaleDateString('es', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                ))
              ) : (
                <button className="empty-library" onClick={openFolder}>
                  <span className="empty-folder">
                    <FolderOpen size={25} />
                  </span>
                  <span>
                    <b>Abre tu primer repositorio</b>
                    <small>Tu código, sus conexiones y lo que aprendes sobre él.</small>
                  </span>
                  <span className="keyhint">⌘ O</span>
                </button>
              )}
            </section>
            <section className="starter-layout">
              <div className="starter-examples">
                <div className="section-title">
                  <h2>Prueba una investigación</h2>
                </div>
                <p>Dos proyectos pequeños. Preguntas que atraviesan varios archivos.</p>
                {examples.map((e) => (
                  <button
                    key={e.id}
                    className="project-row"
                    onClick={() => runJob(() => api.import({ kind: 'example', example: e.id }))}
                  >
                    <span className="icon-tile">
                      {e.id === 'pedidos' ? <GitBranch size={20} /> : <Boxes size={20} />}
                    </span>
                    <span>
                      <b>{e.name}</b>
                      <small>{e.description}</small>
                    </span>
                    <ArrowUpRight size={16} />
                  </button>
                ))}
                <button
                  className="text-button"
                  onClick={() => runJob(() => api.import({ kind: 'example', example: 'pedidos' }))}
                >
                  Probar con un ejemplo <ArrowRight size={13} />
                </button>
              </div>
              <div className="learning-preview">
                <div className="preview-top">
                  <span className="preview-dot" />
                  pedidos<span>Una petición, varios momentos</span>
                </div>
                <div className="preview-flow">
                  <div>
                    <span className="preview-node">
                      <Code2 size={16} />
                    </span>
                    <span>
                      <small>Entrada</small>
                      <b>POST /pedidos</b>
                    </span>
                    <code>{'{ unidades: 3 }'}</code>
                  </div>
                  <i />
                  <div>
                    <span className="preview-node">
                      <Boxes size={16} />
                    </span>
                    <span>
                      <small>Transformación</small>
                      <b>Crear el pedido</b>
                    </span>
                    <code>3 × 250</code>
                  </div>
                  <i />
                  <div>
                    <span className="preview-node">
                      <Layers size={16} />
                    </span>
                    <span>
                      <small>Estado</small>
                      <b>Guardar pedido + evento</b>
                    </span>
                    <Check size={16} />
                  </div>
                </div>
                <div className="preview-question">
                  <span>Predice antes de abrir el código</span>
                  <p>Si falla el evento, ¿queda guardado el pedido?</p>
                  <button
                    onClick={() =>
                      runJob(() => api.import({ kind: 'example', example: 'pedidos' }))
                    }
                  >
                    Investigar este proceso <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            </section>
            <footer className="home-footer">
              <span>Hecho para aprender sobre software real.</span>
              <a href={REPO + '/blob/main/README.es.md'} target="_blank" rel="noreferrer">
                Documentación <ArrowUpRight size={12} />
              </a>
            </footer>
          </>
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
                  <h1>Entiende cómo encaja todo.</h1>
                  <p className="page-description">{snapshot.plan.summary}</p>
                  {snapshot.plan.summarySource && (
                    <Citation
                      anchor={snapshot.plan.summarySource}
                      onClick={setSource}
                      label="Descripción del proyecto"
                    />
                  )}
                </div>
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
                            <span className="unit-index">{String(i + 1).padStart(2, '0')}</span>
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
                  <div className="features">
                    {snapshot.plan.features.map((f, i) => (
                      <button key={f.id} onClick={() => study(f)} className="feature-row">
                        <span className="feature-symbol">
                          <GitBranch size={19} />
                        </span>
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
                  onTutor={() => setDialog('tutor')}
                  onPractice={() => changeView('practice')}
                />
              ) : (
                <Empty title="Elige una funcionalidad">
                  Vuelve al recorrido para abrir un proceso y empezar a seguirlo.
                </Empty>
              ))}
            {view === 'map' && (
              <MapView key={snapshot.id} snapshot={snapshot} onSource={setSource} />
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
        <Modal title="Tu conexión de IA" onClose={() => setDialog('')}>
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
