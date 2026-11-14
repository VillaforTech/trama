import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Store, AppError } from './database.js';
import { EXAMPLES, importRepository } from './repository.js';
import { registerLearningRoutes } from './learning.js';
import type { ImportRequest, Job, Learning } from '../shared/types.js';

export function createApp(store = new Store()): Express {
  const app = express(),
    jobs = new Map<string, Job>();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    const host = req.headers.host?.split(':')[0];
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host || '')) {
      res.status(403).json({ error: 'Este servicio sólo acepta conexiones locales.' });
      return;
    }
    if (req.path.startsWith('/api/')) {
      const desktopKey = process.env.TRAMA_DESKTOP_KEY;
      if (desktopKey) {
        const provided = req.headers['x-trama-desktop-key'];
        const expectedBytes = Buffer.from(desktopKey);
        const providedBytes =
          typeof provided === 'string' ? Buffer.from(provided) : Buffer.alloc(0);
        if (
          providedBytes.length !== expectedBytes.length ||
          !timingSafeEqual(providedBytes, expectedBytes)
        ) {
          res.status(403).json({ error: 'Abre la aplicación Trama para continuar.' });
          return;
        }
      }
      res.setHeader('Cache-Control', 'no-store');
      const origin = req.headers.origin;
      if (origin) {
        let allowed = false;
        try {
          const url = new URL(origin);
          allowed =
            url.protocol === 'http:' &&
            ['127.0.0.1', 'localhost'].includes(url.hostname) &&
            (url.host === req.headers.host || (!process.env.TRAMA_DESKTOP && url.port === '5173'));
        } catch {}
        if (!allowed) {
          res.status(403).json({ error: 'Origen de solicitud no permitido.' });
          return;
        }
      }
      if (req.headers['x-trama-request'] !== '1') {
        res.status(403).json({ error: 'Abre Trama para acceder a esta operación.' });
        return;
      }
    }
    next();
  });
  app.use(express.json({ limit: '48mb' }));
  function required(id: string) {
    const snapshot = store.snapshot(id);
    if (!snapshot) throw new AppError('La revisión no existe.', 404);
    return snapshot;
  }
  function run(request: ImportRequest) {
    if ([...jobs.values()].some((j) => j.status === 'running'))
      throw new AppError(
        'Hay una lectura en curso. Espera a que termine antes de abrir otra.',
        409,
      );
    const id = randomUUID(),
      job: Job = { id, status: 'running', phase: 'Preparando la lectura…', progress: 0 };
    jobs.set(id, job);
    // Tokens stay in this request's closure and are never attached to the job or snapshot.
    void importRepository(request, store, (phase, progress) =>
      Object.assign(job, { phase, progress }),
    )
      .then((snapshot) =>
        Object.assign(job, {
          status: 'complete',
          snapshotId: snapshot.id,
          phase: 'Listo',
          progress: 100,
        }),
      )
      .catch((error) =>
        Object.assign(job, {
          status: 'failed',
          error:
            error instanceof AppError
              ? error.message
              : 'No se pudo abrir el repositorio. Revisa los permisos de lectura y vuelve a intentarlo.',
        }),
      )
      .finally(() => {
        delete request.token;
        while (jobs.size > 40) jobs.delete(jobs.keys().next().value!);
      });
    return { jobId: id };
  }
  app.get('/api/health', (_req, res) => res.json({ version: '0.1.0', local: true }));
  app.get('/api/projects', (_req, res) => res.json(store.projects()));
  app.get('/api/examples', (_req, res) => res.json(EXAMPLES));
  app.post('/api/import', (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || typeof body.kind !== 'string')
      throw new AppError('La solicitud de importación está incompleta.');
    const { kind, path: location, repo, token, example } = body;
    if (token !== undefined && typeof token !== 'string')
      throw new AppError('La credencial debe ser texto.');
    res.status(202).json(run({ kind, path: location, repo, token, example }));
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(String(req.params.id));
    if (!job) throw new AppError('La lectura ya no está disponible.', 404);
    res.json(job);
  });
  app.get('/api/snapshots/:id', (req, res) => res.json(required(String(req.params.id))));
  app.get('/api/snapshots/:id/file', (req, res) => {
    const id = String(req.params.id);
    required(id);
    if (typeof req.query.path !== 'string') throw new AppError('Falta la ruta del archivo.');
    const file = store.file(id, req.query.path);
    if (!file) throw new AppError('El archivo está fuera de esta revisión.', 404);
    res.json(file);
  });
  app.get('/api/snapshots/:id/search', (req, res) => {
    const id = String(req.params.id);
    required(id);
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 200)
      throw new AppError('Busca entre 2 y 200 caracteres.');
    const needle = query.toLocaleLowerCase(),
      matches: { path: string; line: number; text: string }[] = [];
    for (const file of store.files(id)) {
      const lines = file.text.split(/\r\n|\r|\n/);
      for (let i = 0; i < lines.length && matches.length < 100; i++)
        if (lines[i].toLocaleLowerCase().includes(needle))
          matches.push({ path: file.path, line: i + 1, text: lines[i].slice(0, 600) });
      if (matches.length >= 100) break;
    }
    res.json({ matches, limited: matches.length === 100 });
  });
  app.put('/api/snapshots/:id/learning', (req, res) => {
    required(String(req.params.id));
    const { value, version } = req.body || {};
    if (!Number.isInteger(version) || version < 0)
      throw new AppError('Falta la versión del cuaderno.');
    res.json(store.saveLearning(String(req.params.id), value as Learning, version));
  });
  app.get('/api/snapshots/:id/export', (req, res) => {
    const snapshot = required(String(req.params.id));
    res.setHeader('Content-Disposition', 'attachment; filename="trama-' + snapshot.id + '.json"');
    res.json(store.export(snapshot.id));
  });
  app.post('/api/restore', (req, res) =>
    res.status(201).json({ snapshotId: store.restore(req.body).id }),
  );
  app.get('/api/projects/:id/snapshots', (req, res) =>
    res.json(
      store.revisions(String(req.params.id)).map(({ id, name, revision, createdAt, coverage }) => ({
        id,
        name,
        revision,
        createdAt,
        coverage,
      })),
    ),
  );
  app.post('/api/projects/:id/refresh', (req, res) => {
    const project = store.project(String(req.params.id));
    if (!project) throw new AppError('El proyecto no existe.', 404);
    const token = req.body?.token;
    if (token !== undefined && typeof token !== 'string')
      throw new AppError('La credencial debe ser texto.');
    const example = EXAMPLES.find(
      (e) =>
        path.resolve(process.env.TRAMA_APP_ROOT || process.cwd(), 'examples', e.id) ===
        project.location,
    );
    res.status(202).json(
      run({
        kind: project.source,
        path: project.location,
        repo: project.location,
        example: example?.id,
        token,
      }),
    );
  });
  app.delete('/api/projects/:id', (req, res) => {
    store.deleteProject(String(req.params.id));
    res.status(204).end();
  });
  app.post('/api/snapshots/:id/compare', (req, res) => {
    const before = required(String(req.params.id)),
      after = required(String(req.body?.otherId || ''));
    if (before.projectId !== after.projectId)
      throw new AppError('Elige dos revisiones del mismo proyecto.');
    const a = new Map(before.files.map((f) => [f.path, f.hash])),
      b = new Map(after.files.map((f) => [f.path, f.hash]));
    const added = after.files.filter((f) => !a.has(f.path)).map((f) => ({ path: f.path })),
      removed = before.files.filter((f) => !b.has(f.path)).map((f) => ({ path: f.path })),
      changed = after.files
        .filter((f) => a.has(f.path) && a.get(f.path) !== f.hash)
        .map((f) => ({ path: f.path }));
    res.json({ added, removed, changed });
  });
  registerLearningRoutes(app, {
    getSnapshot: (id: string) => store.snapshot(id),
    getFiles: (id: string) => store.files(id),
    dataDir: store.dataDir,
  });
  const dist = path.resolve(process.env.TRAMA_APP_ROOT || process.cwd(), 'dist');
  app.use(express.static(dist, { index: 'index.html', dotfiles: 'deny' }));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/')) {
      const desktopKey = process.env.TRAMA_DESKTOP_KEY;
      if (desktopKey) {
        const provided = req.headers['x-trama-desktop-key'];
        const expectedBytes = Buffer.from(desktopKey);
        const providedBytes =
          typeof provided === 'string' ? Buffer.from(provided) : Buffer.alloc(0);
        if (
          providedBytes.length !== expectedBytes.length ||
          !timingSafeEqual(providedBytes, expectedBytes)
        ) {
          res.status(403).json({ error: 'Abre la aplicación Trama para continuar.' });
          return;
        }
      }
      res.status(404).json({ error: 'Operación no encontrada.' });
      return;
    }
    res.sendFile(path.join(dist, 'index.html'));
  });
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    if (error instanceof AppError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    if (error instanceof SyntaxError) {
      res.status(400).json({ error: 'La solicitud contiene JSON inválido.' });
      return;
    }
    if ((error as { type?: string })?.type === 'entity.too.large') {
      res.status(413).json({ error: 'La solicitud supera el tamaño permitido.' });
      return;
    }
    res.status(500).json({
      error: 'No se pudo completar la operación. Tus fuentes originales siguen disponibles.',
    });
  });
  return app;
}
const main =
  process.env.TRAMA_DESKTOP === '1' ||
  (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));
if (main) {
  const port = Number(process.env.PORT || 4891);
  if (!Number.isInteger(port) || (port !== 0 && port < 1024) || port > 65535)
    throw new Error('PORT debe ser 0 o estar entre 1024 y 65535.');
  const store = new Store();
  const server = createApp(store).listen(port, '127.0.0.1', () => {
    const address = server.address();
    const actualPort = address && typeof address !== 'string' ? address.port : port;
    const parent = (
      process as NodeJS.Process & { parentPort?: { postMessage: (message: unknown) => void } }
    ).parentPort;
    if (parent)
      parent.postMessage({ type: 'ready', port: actualPort, nodeVersion: process.versions.node });
    else console.log('Trama está disponible en http://127.0.0.1:' + actualPort);
  });
  server.on('error', () => {
    console.error('No se pudo iniciar Trama. Comprueba si el puerto está ocupado.');
    process.exitCode = 1;
  });
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.on(signal, () =>
      server.close(() => {
        store.close();
        process.exit(0);
      }),
    );
}
