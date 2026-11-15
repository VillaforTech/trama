import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import type {
  Learning,
  Snapshot,
  SourceFile,
  ProjectSummary,
  Plan,
  Graph,
  Anchor,
} from '../shared/types.js';

export function hash(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type Capture = Omit<Snapshot, 'files' | 'learning' | 'learningVersion' | 'createdAt'> & {
  files: SourceFile[];
};
function parse<T>(text: unknown): T {
  return JSON.parse(String(text)) as T;
}
export class Store {
  readonly db: DatabaseSync;
  readonly dataDir: string;
  constructor(directory = process.env.TRAMA_DATA_DIR || path.join(os.homedir(), '.trama')) {
    this.dataDir = path.resolve(directory);
    mkdirSync(this.dataDir, { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path.join(this.dataDir, 'trama.sqlite'));
    chmodSync(path.join(this.dataDir, 'trama.sqlite'), 0o600);
    this.db.exec(`
      PRAGMA journal_mode=WAL;
      PRAGMA foreign_keys=ON;
      PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, name TEXT NOT NULL, source TEXT NOT NULL, location TEXT NOT NULL, latest_snapshot_id TEXT NOT NULL, updated_at TEXT NOT NULL, file_count INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, metadata TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS files(snapshot_id TEXT NOT NULL REFERENCES snapshots(id) ON DELETE CASCADE, path TEXT NOT NULL, text TEXT NOT NULL, metadata TEXT NOT NULL, PRIMARY KEY(snapshot_id,path));
      CREATE TABLE IF NOT EXISTS learning(snapshot_id TEXT PRIMARY KEY REFERENCES snapshots(id) ON DELETE CASCADE, value TEXT NOT NULL DEFAULT '{}', version INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS snapshot_project ON snapshots(project_id,created_at);
      PRAGMA user_version=1;
    `);
  }
  close() {
    this.db.close();
  }
  projects(): ProjectSummary[] {
    return this.db
      .prepare(
        'SELECT id,name,source,location,latest_snapshot_id AS latestSnapshotId,updated_at AS updatedAt,file_count AS fileCount FROM projects ORDER BY updated_at DESC',
      )
      .all() as unknown as ProjectSummary[];
  }
  project(id: string): ProjectSummary | null {
    return this.projects().find((p) => p.id === id) || null;
  }
  snapshot(id: string): Snapshot | null {
    const row = this.db.prepare('SELECT metadata,created_at FROM snapshots WHERE id=?').get(id);
    if (!row) return null;
    const progress = this.db
      .prepare('SELECT value,version FROM learning WHERE snapshot_id=?')
      .get(id)!;
    const metadata = parse<Omit<Snapshot, 'files' | 'learning' | 'learningVersion'>>(row.metadata);
    const files = this.db
      .prepare('SELECT metadata FROM files WHERE snapshot_id=? ORDER BY path')
      .all(id)
      .map((row) => parse<Omit<SourceFile, 'text'>>(row.metadata));
    return {
      ...metadata,
      files,
      learning: parse<Learning>(progress.value),
      learningVersion: Number(progress.version),
    };
  }
  files(id: string): SourceFile[] {
    return this.db
      .prepare('SELECT text,metadata FROM files WHERE snapshot_id=? ORDER BY path')
      .all(id)
      .map((row) => ({ ...parse<Omit<SourceFile, 'text'>>(row.metadata), text: String(row.text) }));
  }
  file(id: string, name: string): SourceFile | null {
    const row = this.db
      .prepare('SELECT text,metadata FROM files WHERE snapshot_id=? AND path=?')
      .get(id, name);
    return row
      ? { ...parse<Omit<SourceFile, 'text'>>(row.metadata), text: String(row.text) }
      : null;
  }
  save(capture: Capture, initialLearning?: Learning): Snapshot {
    const initial = initialLearning === undefined ? '{}' : JSON.stringify(initialLearning);
    if (initialLearning !== undefined) validateLearning(initialLearning, capture.files);
    const now = new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO projects(id,name,source,location,latest_snapshot_id,updated_at,file_count) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,latest_snapshot_id=excluded.latest_snapshot_id,updated_at=excluded.updated_at,file_count=excluded.file_count',
        )
        .run(
          capture.projectId,
          capture.name,
          capture.source,
          capture.location,
          capture.id,
          now,
          capture.files.length,
        );
      if (!this.db.prepare('SELECT id FROM snapshots WHERE id=?').get(capture.id)) {
        const { files, ...data } = capture;
        const metadata = { ...data, createdAt: now };
        this.db
          .prepare('INSERT INTO snapshots(id,project_id,metadata,created_at) VALUES(?,?,?,?)')
          .run(capture.id, capture.projectId, JSON.stringify(metadata), now);
        const insert = this.db.prepare(
          'INSERT INTO files(snapshot_id,path,text,metadata) VALUES(?,?,?,?)',
        );
        for (const { text, ...meta } of files)
          insert.run(capture.id, meta.path, text, JSON.stringify(meta));
        this.db
          .prepare('INSERT INTO learning(snapshot_id,value,version) VALUES(?,?,?)')
          .run(capture.id, initial, initialLearning === undefined ? 0 : 1);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.snapshot(capture.id)!;
  }
  saveLearning(id: string, value: Learning, version: number): { value: Learning; version: number } {
    validateLearning(value, this.files(id));
    const encoded = JSON.stringify(value);
    if (encoded.length > 2_000_000) throw new AppError('El cuaderno supera el límite de 2 MB.');
    const result = this.db
      .prepare('UPDATE learning SET value=?,version=version+1 WHERE snapshot_id=? AND version=?')
      .run(encoded, id, version);
    if (!result.changes) {
      if (!this.snapshot(id)) throw new AppError('La revisión ya no existe.', 404);
      throw new AppError(
        'Otra ventana guardó cambios. Recarga la revisión antes de continuar.',
        409,
      );
    }
    this.db
      .prepare(
        'UPDATE projects SET updated_at=? WHERE id=(SELECT project_id FROM snapshots WHERE id=?)',
      )
      .run(new Date().toISOString(), id);
    return { value, version: version + 1 };
  }
  revisions(projectId: string): Snapshot[] {
    return this.db
      .prepare('SELECT id FROM snapshots WHERE project_id=? ORDER BY created_at DESC')
      .all(projectId)
      .map((row) => this.snapshot(String(row.id))!);
  }
  deleteProject(id: string) {
    this.db.prepare('DELETE FROM projects WHERE id=?').run(id);
  }
  export(id: string) {
    const snapshot = this.snapshot(id);
    if (!snapshot) throw new AppError('No se encontró la revisión.', 404);
    return { format: 'trama-project', version: 1, snapshot, files: this.files(id) };
  }
  restore(value: unknown): Snapshot {
    if (!value || typeof value !== 'object') throw new AppError('Copia de Trama inválida.');
    const bundle = value as Record<string, unknown>;
    if (
      bundle.format !== 'trama-project' ||
      bundle.version !== 1 ||
      !bundle.snapshot ||
      !Array.isArray(bundle.files)
    )
      throw new AppError('Esta copia no pertenece a Trama o usa una versión incompatible.');
    const snapshot = bundle.snapshot as Snapshot,
      files = bundle.files as SourceFile[];
    if (
      !['local', 'github', 'example'].includes(snapshot.source) ||
      !snapshot.id ||
      !snapshot.projectId ||
      typeof snapshot.location !== 'string' ||
      typeof snapshot.name !== 'string' ||
      typeof snapshot.revision !== 'string'
    )
      throw new AppError('La copia contiene metadatos incompletos.');
    validateFiles(files);
    validatePlan(snapshot.plan, files);
    validateLearning(snapshot.learning, files);
    if (
      !snapshot.coverage ||
      !Number.isInteger(snapshot.coverage.indexed) ||
      snapshot.coverage.indexed < 0 ||
      !Number.isInteger(snapshot.coverage.skipped) ||
      snapshot.coverage.skipped < 0 ||
      !Number.isInteger(snapshot.coverage.bytes) ||
      snapshot.coverage.bytes < 0 ||
      !Array.isArray(snapshot.coverage.limitations) ||
      snapshot.coverage.limitations.some((limitation) => typeof limitation !== 'string')
    )
      throw new AppError('La cobertura de la copia está incompleta.');
    const expectedProject = hash(snapshot.source + '|' + snapshot.location).slice(0, 24);
    const expectedSnapshot = hash(
      expectedProject +
        '|' +
        snapshot.revision +
        '|' +
        [...files]
          .sort((a, b) => a.path.localeCompare(b.path))
          .map((f) => f.path + '\0' + hash(f.text))
          .join('\n'),
    ).slice(0, 32);
    if (snapshot.projectId !== expectedProject || snapshot.id !== expectedSnapshot)
      throw new AppError('La identidad de la copia no coincide con su revisión y sus fuentes.');
    if (
      !snapshot.graph ||
      !Array.isArray(snapshot.graph.nodes) ||
      !Array.isArray(snapshot.graph.edges)
    )
      throw new AppError('La copia carece de un mapa válido.');
    const analysis = snapshot.graph.analysis;
    if (
      analysis !== undefined &&
      (!analysis ||
        analysis.version !== 1 ||
        [
          'parsedFiles',
          'candidateFiles',
          'otherFiles',
          'unresolvedLocalImports',
          'externalImports',
          'dynamicImports',
        ].some((key) => {
          const value = (analysis as unknown as Record<string, unknown>)[key];
          return typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0;
        }) ||
        !Array.isArray(analysis.limitations) ||
        analysis.limitations.length > 100 ||
        analysis.limitations.some((item) => typeof item !== 'string' || item.length > 4000))
    )
      throw new AppError('La cobertura del análisis del mapa es inválida.');
    const paths = new Set(files.map((f) => f.path));
    for (const node of snapshot.graph.nodes)
      if (
        !node ||
        typeof node.label !== 'string' ||
        typeof node.kind !== 'string' ||
        !Array.isArray(node.symbols) ||
        node.symbols.some((symbol) => typeof symbol !== 'string')
      )
        throw new AppError('Un nodo del mapa es inválido.');
    for (const edge of snapshot.graph.edges)
      if (
        !edge ||
        typeof edge.id !== 'string' ||
        typeof edge.kind !== 'string' ||
        !Number.isInteger(edge.line) ||
        edge.line < 1
      )
        throw new AppError('Una conexión del mapa es inválida.');
    if (
      snapshot.graph.nodes.some((node) => !paths.has(node.id) || node.id !== node.path) ||
      snapshot.graph.edges.some((edge) => !paths.has(edge.source) || !paths.has(edge.target))
    )
      throw new AppError('El mapa cita archivos que no están en la copia.');
    const current = this.snapshot(snapshot.id);
    if (current) {
      if (JSON.stringify(this.files(snapshot.id)) !== JSON.stringify(files))
        throw new AppError('La revisión guardada contiene fuentes diferentes.', 409);
      if (JSON.stringify(current.learning) !== JSON.stringify(snapshot.learning))
        throw new AppError(
          'La biblioteca ya contiene esta revisión con otro cuaderno. Conserva ambas copias por separado.',
          409,
        );
      return current;
    }
    // Restored local paths remain provenance, and are never scanned automatically.
    return this.save(
      {
        id: snapshot.id,
        projectId: snapshot.projectId,
        name: snapshot.name,
        source: snapshot.source,
        location: snapshot.location,
        revision: snapshot.revision,
        coverage: snapshot.coverage,
        plan: snapshot.plan,
        graph: snapshot.graph,
        files,
      },
      snapshot.learning,
    );
  }
}
export function validateFiles(files: SourceFile[]) {
  if (!files.length || files.length > 4000)
    throw new AppError('La copia debe contener entre 1 y 4000 fuentes.');
  let bytes = 0;
  const seen = new Set<string>();
  for (const f of files) {
    if (
      !f ||
      typeof f.path !== 'string' ||
      typeof f.text !== 'string' ||
      f.path.startsWith('/') ||
      f.path.includes('\\') ||
      f.path.split('/').some((p) => p === '..' || !p) ||
      /[\x00-\x1f]/.test(f.path) ||
      seen.has(f.path)
    )
      throw new AppError('La copia contiene una ruta de fuente inválida.');
    seen.add(f.path);
    bytes += Buffer.byteLength(f.text);
    if (Buffer.byteLength(f.text) > 512 * 1024)
      throw new AppError('Una fuente supera el límite de lectura.');
    if (
      typeof f.size !== 'number' ||
      f.size < 0 ||
      f.size > 512 * 1024 ||
      (f.language !== undefined && typeof f.language !== 'string') ||
      (f.url !== undefined && typeof f.url !== 'string')
    )
      throw new AppError('Los metadatos de una fuente son inválidos.');
    if (f.hash && f.hash !== hash(f.text))
      throw new AppError('La huella de una fuente no coincide con su contenido.');
  }
  if (bytes > 32 * 1024 * 1024) throw new AppError('La copia supera 32 MB de fuentes.');
}
export function validatePlan(plan: Plan, files: SourceFile[]) {
  if (
    !plan ||
    typeof plan.summary !== 'string' ||
    !Array.isArray(plan.architecture) ||
    !Array.isArray(plan.features)
  )
    throw new AppError('El plan de la copia está incompleto.');
  const index = new Map(files.map((f) => [f.path, f.text.split(/\r\n|\r|\n/)]));
  function anchors(items: Anchor[]) {
    if (!Array.isArray(items)) throw new AppError('Faltan referencias en el plan.');
    for (const a of items) {
      const rows = index.get(a.path);
      if (
        !rows ||
        !Number.isInteger(a.line) ||
        !Number.isInteger(a.end) ||
        a.line < 1 ||
        a.end < a.line ||
        a.end > rows.length ||
        a.excerpt !== rows.slice(a.line - 1, a.end).join('\n')
      )
        throw new AppError('Una referencia no coincide con las líneas de su archivo.');
    }
  }
  if (plan.summarySource) anchors([plan.summarySource]);
  for (const unit of [...plan.architecture, ...plan.features]) {
    if (
      !unit ||
      typeof unit.id !== 'string' ||
      typeof unit.title !== 'string' ||
      typeof unit.description !== 'string' ||
      typeof unit.reason !== 'string' ||
      !['source', 'inferred', 'unknown'].includes(unit.status) ||
      !Array.isArray(unit.processes) ||
      !Array.isArray(unit.related)
    )
      throw new AppError('Una unidad del plan está incompleta.');
    anchors(unit.sources);
    for (const link of unit.related) {
      if (
        !link ||
        typeof link.id !== 'string' ||
        typeof link.title !== 'string' ||
        typeof link.reason !== 'string'
      )
        throw new AppError('Una relación del plan es inválida.');
      if (link.sources) anchors(link.sources);
    }
    for (const process of unit.processes) {
      if (
        !process ||
        typeof process.id !== 'string' ||
        typeof process.title !== 'string' ||
        typeof process.description !== 'string' ||
        !['source', 'inferred', 'unknown'].includes(process.status) ||
        !Array.isArray(process.steps)
      )
        throw new AppError('Un proceso está incompleto.');
      anchors(process.sources);
      for (const step of process.steps) {
        if (
          !step ||
          typeof step.title !== 'string' ||
          typeof step.detail !== 'string' ||
          !['source', 'inferred', 'unknown'].includes(step.status)
        )
          throw new AppError('Un paso del proceso es inválido.');
        anchors(step.sources);
      }
    }
  }
}

function validateLearning(value: Learning, files: SourceFile[]) {
  const record = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  if (!record(value) || JSON.stringify(value).length > 2_000_000)
    throw new AppError('El cuaderno debe ser un objeto de hasta 2 MB.');
  if (value.notes !== undefined && typeof value.notes !== 'string')
    throw new AppError('La explicación del cuaderno debe ser texto.');
  if (value.position !== undefined) {
    if (
      !record(value.position) ||
      typeof value.position.view !== 'string' ||
      !['overview', 'read', 'map', 'files', 'practice', 'notebook'].includes(value.position.view)
    )
      throw new AppError('La posición de lectura está incompleta.');
    if (
      value.position.step !== undefined &&
      (typeof value.position.step !== 'number' ||
        !Number.isInteger(value.position.step) ||
        value.position.step < 0)
    )
      throw new AppError('El paso guardado es inválido.');
    for (const field of ['unit', 'process'] as const)
      if (value.position[field] !== undefined && typeof value.position[field] !== 'string')
        throw new AppError('La ruta guardada es inválida.');
  }
  if (value.answers !== undefined) {
    if (!record(value.answers))
      throw new AppError('Las respuestas del cuaderno deben estar identificadas.');
    for (const answer of Object.values(value.answers)) {
      if (!record(answer)) throw new AppError('Una respuesta del cuaderno es inválida.');
      for (const field of ['prediction', 'reflection', 'variant', 'updatedAt'])
        if (answer[field] !== undefined && typeof answer[field] !== 'string')
          throw new AppError('Una respuesta contiene texto inválido.');
      for (const field of ['revealed', 'hintUsed'])
        if (answer[field] !== undefined && typeof answer[field] !== 'boolean')
          throw new AppError('Una respuesta contiene un estado inválido.');
      if (answer.review !== undefined && !['match', 'gap'].includes(String(answer.review)))
        throw new AppError('La revisión de una respuesta es inválida.');
    }
  }
  if (value.sessions !== undefined && !Array.isArray(value.sessions))
    throw new AppError('Las sesiones deben ser una lista.');
  if (value.attempts !== undefined && !Array.isArray(value.attempts))
    throw new AppError('Los intentos deben ser una lista.');
  const date = (text: unknown) => typeof text === 'string' && Number.isFinite(Date.parse(text));
  for (const attempt of value.attempts || []) {
    if (
      !record(attempt) ||
      typeof attempt.id !== 'string' ||
      typeof attempt.exerciseId !== 'string' ||
      typeof attempt.answer !== 'string' ||
      typeof attempt.assisted !== 'boolean' ||
      typeof attempt.review !== 'string' ||
      !['correct', 'partial', 'gap'].includes(attempt.review) ||
      !date(attempt.createdAt) ||
      !date(attempt.dueAt)
    )
      throw new AppError('Un intento de práctica está incompleto.');
  }
  const rows = new Map(files.map((file) => [file.path, file.text.split(/\r\n|\r|\n/)]));
  for (const session of value.sessions || []) {
    if (
      !record(session) ||
      typeof session.id !== 'string' ||
      typeof session.question !== 'string' ||
      !date(session.createdAt) ||
      !record(session.answer)
    )
      throw new AppError('Una sesión del cuaderno está incompleta.');
    const answer = session.answer;
    if (
      typeof answer.summary !== 'string' ||
      typeof answer.nextQuestion !== 'string' ||
      !Array.isArray(answer.claims)
    )
      throw new AppError('La explicación de una sesión es inválida.');
    if (
      answer.example !== undefined &&
      (!record(answer.example) ||
        ['title', 'description', 'input', 'output'].some(
          (field) => typeof (answer.example as Record<string, unknown>)[field] !== 'string',
        ))
    )
      throw new AppError('El ejemplo de una sesión es inválido.');
    for (const claim of answer.claims) {
      if (
        !record(claim) ||
        typeof claim.text !== 'string' ||
        !['source', 'inferred', 'unknown'].includes(String(claim.status)) ||
        !Array.isArray(claim.sources) ||
        (claim.status === 'source' && claim.sources.length === 0)
      )
        throw new AppError('Una afirmación del cuaderno es inválida.');
      for (const source of claim.sources) {
        if (
          !record(source) ||
          typeof source.path !== 'string' ||
          typeof source.excerpt !== 'string' ||
          !Number.isInteger(source.line) ||
          !Number.isInteger(source.end)
        )
          throw new AppError('Una referencia del cuaderno es inválida.');
        const first = Number(source.line),
          last = Number(source.end),
          content = rows.get(source.path);
        if (
          !content ||
          first < 1 ||
          last < first ||
          last > content.length ||
          content.slice(first - 1, last).join('\n') !== source.excerpt
        )
          throw new AppError('Una referencia del cuaderno no corresponde a su revisión.');
      }
    }
  }
}
