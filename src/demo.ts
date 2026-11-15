import type {
  Learning,
  ProjectSummary,
  Snapshot,
  SourceFile,
  Job,
  ImportRequest,
} from '../shared/types';
interface Bundle {
  snapshot: Snapshot;
  files: SourceFile[];
  exercises: unknown[];
}
let bundles: Bundle[] = [];
const jobs = new Map<string, Job>();
const key = 'trama-public-demo-v1';
function read(): Record<string, { learning: Learning; version: number }> {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    return {};
  }
}
function save(value: ReturnType<typeof read>) {
  localStorage.setItem(key, JSON.stringify(value));
}
async function data() {
  if (!bundles.length) {
    const r = await fetch(import.meta.env.BASE_URL + 'examples.json');
    if (!r.ok) throw new Error('No se pudieron abrir los ejemplos. Recarga la página.');
    bundles = await r.json();
  }
  return bundles;
}
export async function demoRequest(path: string, body?: unknown, method?: string): Promise<unknown> {
  const list = await data(),
    stored = read(),
    url = new URL(path, 'http://demo.local');
  const parts = url.pathname.split('/').filter(Boolean),
    id = parts[1],
    b = list.find((v) => v.snapshot.id === id);
  const publicSnapshot = (item: Bundle) => ({
    ...item.snapshot,
    learning: stored[item.snapshot.id]?.learning || {},
    learningVersion: stored[item.snapshot.id]?.version || 0,
  });
  if (path === '/health') return { version: '0.1.0', local: false };
  if (path === '/projects')
    return list
      .filter((b) => stored[b.snapshot.id])
      .map(
        ({ snapshot: s }) =>
          ({
            id: s.projectId,
            name: s.name,
            source: 'example',
            location: s.location,
            latestSnapshotId: s.id,
            updatedAt: s.createdAt,
            fileCount: s.files.length,
          }) satisfies ProjectSummary,
      );
  if (path === '/import') {
    const input = body as ImportRequest;
    if (input.kind !== 'example')
      throw new Error('Instala Trama para abrir tu código privado en tu propio equipo.');
    const b = list.find((x) => x.snapshot.location.endsWith(input.example || 'pedidos'));
    if (!b) throw new Error('No se encontró el ejemplo.');
    stored[b.snapshot.id] ||= { learning: {}, version: 0 };
    save(stored);
    const jobId = crypto.randomUUID();
    jobs.set(jobId, {
      id: jobId,
      status: 'complete',
      phase: 'Ejemplo preparado',
      progress: 100,
      snapshotId: b.snapshot.id,
    });
    return { jobId };
  }
  if (parts[0] === 'jobs') return jobs.get(id);
  if (path === '/chatgpt/status')
    return {
      available: false,
      connected: false,
      sharing: false,
      model: '',
      models: [],
      phase: 'idle',
      welcomeSeen: true,
      usageUrl: 'https://chatgpt.com/settings/usage',
    };
  if (parts[0] === 'provider') {
    if (parts.length === 1 && !body)
      return { endpoint: '', model: '', configured: false, hasKey: false, isLocal: true };
    throw new Error('La conexión a modelos está disponible en la aplicación local.');
  }
  if (parts[0] === 'projects') {
    if (method === 'DELETE') {
      const entry = list.find((x) => x.snapshot.projectId === id);
      if (entry) {
        delete stored[entry.snapshot.id];
        save(stored);
      }
      return { ok: true };
    }
    return list.filter((x) => x.snapshot.projectId === id).map((x) => publicSnapshot(x));
  }
  if (b && parts[0] === 'snapshots') {
    const action = parts[2];
    if (!action) return publicSnapshot(b);
    if (action === 'file') {
      const f = b.files.find((f) => f.path === url.searchParams.get('path'));
      if (!f) throw new Error('Archivo no incluido.');
      return f;
    }
    if (action === 'search') {
      const q = (url.searchParams.get('q') || '').toLowerCase();
      return {
        matches: b.files
          .flatMap((f) =>
            f.text
              .split(/\r?\n/)
              .map((text, i) => ({ path: f.path, line: i + 1, text }))
              .filter((r) => q && r.text.toLowerCase().includes(q)),
          )
          .slice(0, 100),
      };
    }
    if (action === 'learning') {
      const next = body as { value: Learning; version: number },
        old = stored[id] || { learning: {}, version: 0 };
      if (next.version !== old.version)
        throw new Error('Otra pestaña cambió este cuaderno. Recarga para recuperar su versión.');
      stored[id] = { learning: next.value, version: old.version + 1 };
      save(stored);
      return { value: next.value, version: old.version + 1 };
    }
    if (action === 'exercises') return b.exercises;
    if (action === 'export')
      return { format: 'trama-demo', version: 1, ...b, snapshot: publicSnapshot(b) };
    if (action === 'ask')
      throw new Error(
        'Instala Trama para conectar tu modelo y pedir explicaciones sobre el código.',
      );
    if (action === 'compare') return { added: [], removed: [], changed: [] };
  }
  if (path === '/restore') {
    const v = body as { format?: string; snapshot?: Snapshot };
    if (
      v.format !== 'trama-demo' ||
      !v.snapshot ||
      !list.some((b) => b.snapshot.id === v.snapshot!.id)
    )
      throw new Error(
        'En la demo puedes restaurar una copia de sus ejemplos. Usa la aplicación local para otros cuadernos.',
      );
    stored[v.snapshot.id] = {
      learning: v.snapshot.learning,
      version: (stored[v.snapshot.id]?.version || 0) + 1,
    };
    save(stored);
    return { snapshotId: v.snapshot.id };
  }
  throw new Error('Esta operación requiere la aplicación local de Trama.');
}
