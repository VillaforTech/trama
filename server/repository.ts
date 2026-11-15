import { readdir, readFile, realpath, lstat, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ignore, { type Ignore } from 'ignore';
import type { ImportRequest, SourceFile, Snapshot, Plan } from '../shared/types.js';
import { Store, AppError, hash, validatePlan } from './database.js';
import { build } from './organizer.js';
import { buildGraph } from './graph.js';

const execFileAsync = promisify(execFile);
const MAX_FILES = 4000,
  MAX_BYTES = 32 * 1024 * 1024,
  MAX_FILE_BYTES = 512 * 1024,
  MAX_REMOTE_FILES = 500;
const blockedDirectory =
  /^(?:\.git|\.hg|\.svn|\.idea|\.vscode|node_modules|dist|build|\.next|\.nuxt|\.cache|\.venv|venv|__pycache__|vendor|target|\.terraform|\.trama|playwright-report|test-results|lcov-report)$/i;
const blockedFile =
  /^(?:\.env(?:\..*)?|\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.dockercfg|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?|credentials(?:\.json)?|auth\.json|chatgpt-(?:auth|settings|preferences)\.(?:json|lock)(?:\..*)?|application_default_credentials\.json|terraform\.tfstate(?:\..*)?|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|poetry\.lock|uv\.lock|Cargo\.lock|Gemfile\.lock)$/i;
const blockedExtension =
  /\.(?:pem|key|p12|pfx|jks|keystore|sqlite3?|db|db-wal|db-shm|zip|gz|tar|7z|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp[34]|wav|pdf|exe|dll|so|dylib|pyc|class|jar|map|lock)$/i;
const supported =
  /\.(?:[cm]?[jt]sx?|py|csv|tsv|jsonc?|ya?ml|toml|mdx?|rst|txt|css|scss|html|vue|svelte|go|rs|rb|php|java|kt|swift|c|h|cpp|hpp|cc|cs|sql|sh|bash|zsh|xml|graphql|gql|proto|ini|cfg|conf|r|jl|ex|exs|erl|hs|lua|dockerfile)$/i;
const special =
  /^(?:Dockerfile|Makefile|Gemfile|Rakefile|Procfile|CMakeLists\.txt|README|LICENSE|\.gitignore|\.tramaignore)$/i;
const credentialText =
  /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{50,}\b|\bAKIA[0-9A-Z]{16}\b|\bsk-(?:proj-)?[A-Za-z0-9_-]{40,})/;
type Progress = (phase: string, progress: number) => void;
interface Rules {
  base: string;
  rules: Ignore;
}
interface ReadResult {
  files: SourceFile[];
  skipped: number;
  bytes: number;
  limitations: string[];
}
export function language(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  return (
    (
      {
        ts: 'typescript',
        tsx: 'typescript',
        js: 'javascript',
        jsx: 'javascript',
        mjs: 'javascript',
        cjs: 'javascript',
        py: 'python',
        md: 'markdown',
        yml: 'yaml',
        rs: 'rust',
        rb: 'ruby',
        sh: 'shell',
      } as Record<string, string>
    )[ext] ||
    ext ||
    'text'
  );
}
function excluded(name: string, directory = false): boolean {
  return directory
    ? blockedDirectory.test(name)
    : blockedFile.test(name) || blockedExtension.test(name);
}
function eligible(name: string): boolean {
  return supported.test(name) || special.test(name) || !path.extname(name);
}
function within(root: string, file: string): boolean {
  const relative = path.relative(root, file);
  return (
    relative === '' ||
    (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative))
  );
}
async function readSafe(root: string, file: string): Promise<Buffer | null> {
  const resolved = await realpath(file);
  if (!within(root, resolved)) return null;
  const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const meta = await fd.stat();
    if (!meta.isFile() || meta.size > MAX_FILE_BYTES) return null;
    const content = await fd.readFile();
    return content.length <= MAX_FILE_BYTES ? content : null;
  } finally {
    await fd.close();
  }
}
function textFile(file: string, bytes: Buffer, url?: string): SourceFile | null {
  if (bytes.includes(0)) return null;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  if (credentialText.test(text)) return null;
  if (!supported.test(file) && !special.test(path.basename(file)) && !text.startsWith('#!'))
    return null;
  return {
    path: file,
    text,
    size: bytes.length,
    hash: hash(text),
    language: language(file),
    ...(url ? { url } : {}),
  };
}
export async function readLocal(
  directory: string,
  onProgress: Progress = () => {},
): Promise<ReadResult & { root: string }> {
  if (!path.isAbsolute(directory))
    throw new AppError('Usa la ruta absoluta de la carpeta del repositorio.');
  let root: string;
  try {
    root = await realpath(directory);
    if (!(await lstat(root)).isDirectory()) throw new Error();
  } catch {
    throw new AppError('No se pudo abrir esa carpeta. Comprueba la ruta y sus permisos.');
  }
  const result: ReadResult = { files: [], skipped: 0, bytes: 0, limitations: [] };
  let visited = 0,
    capped = false,
    ignored = 0;
  async function walk(relative: string, parents: Rules[], depth: number) {
    if (capped) return;
    if (depth > 40 || visited > 30000) {
      capped = true;
      return;
    }
    const folder = path.join(root, relative);
    const rules = [...parents];
    for (const name of ['.gitignore', '.tramaignore']) {
      try {
        const data = await readSafe(root, path.join(folder, name));
        if (data) rules.push({ base: relative, rules: ignore().add(data.toString('utf8')) });
      } catch {}
    }
    const children = (await readdir(folder, { withFileTypes: true })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    for (const entry of children) {
      if (capped) return;
      visited++;
      const file = relative ? relative + '/' + entry.name : entry.name;
      if (entry.isSymbolicLink() || excluded(entry.name, entry.isDirectory())) {
        result.skipped++;
        continue;
      }
      const ignoredByRule = rules.some(({ base, rules }) => {
        const relativeToRule = base ? file.slice(base.length + 1) : file;
        return rules.ignores(relativeToRule + (entry.isDirectory() ? '/' : ''));
      });
      if (ignoredByRule) {
        ignored++;
        result.skipped++;
        continue;
      }
      if (entry.isDirectory()) {
        await walk(file, rules, depth + 1);
        continue;
      }
      if (!entry.isFile() || !eligible(entry.name)) {
        result.skipped++;
        continue;
      }
      if (result.files.length >= MAX_FILES) {
        capped = true;
        return;
      }
      try {
        const bytes = await readSafe(root, path.join(root, file));
        if (!bytes) {
          result.skipped++;
          continue;
        }
        if (result.bytes + bytes.length > MAX_BYTES) {
          capped = true;
          return;
        }
        const source = textFile(file, bytes);
        if (!source) {
          result.skipped++;
          continue;
        }
        result.files.push(source);
        result.bytes += bytes.length;
        if (result.files.length % 40 === 0) {
          onProgress(
            'Leyendo ' + result.files.length + ' fuentes…',
            Math.min(75, 10 + result.files.length / 50),
          );
          await new Promise((resolve) => setImmediate(resolve));
        }
      } catch {
        result.skipped++;
      }
    }
  }
  await walk('', [], 0);
  if (!result.files.length)
    throw new AppError(
      'La carpeta no contiene fuentes de texto compatibles dentro del alcance permitido.',
    );
  if (capped)
    result.limitations.push(
      'Índice parcial por el límite de 4000 fuentes, 32 MB, 30000 entradas o 40 niveles de directorios.',
    );
  if (result.skipped)
    result.limitations.push(
      'Se omitieron ' +
        result.skipped +
        ' entradas por reglas de exclusión, tamaño, permisos, enlaces simbólicos, contenido binario o credenciales reconocibles.',
    );
  if (ignored) result.limitations.push('Se respetaron .gitignore y .tramaignore.');
  return { ...result, root };
}
interface GithubRef {
  owner: string;
  name: string;
  ref?: string;
  url: string;
}
function githubRef(input: string): GithubRef {
  let raw = input.trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) raw = 'https://github.com/' + raw;
  if (raw.startsWith('github.com/')) raw = 'https://' + raw;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError('Escribe una URL de GitHub o propietario/repositorio.');
  }
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent),
    owner = parts[0],
    name = parts[1]?.replace(/\.git$/, '');
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'github.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^[\w-]{1,39}$/.test(owner || '') ||
    !/^[\w.-]{1,100}$/.test(name || '') ||
    ![2, 4].includes(parts.length) ||
    (parts.length === 4 && parts[2] !== 'tree')
  )
    throw new AppError(
      'Usa un repositorio github.com válido, con una referencia opcional /tree/rama.',
    );
  return { owner, name, ref: parts[3], url: 'https://github.com/' + owner + '/' + name };
}
async function hasGhAuth(): Promise<boolean> {
  try {
    await execFileAsync('gh', ['auth', 'status', '--hostname', 'github.com'], {
      timeout: 8000,
      maxBuffer: 32768,
    });
    return true;
  } catch {
    return false;
  }
}
function githubError(status: number): AppError {
  if (status === 401)
    return new AppError(
      'GitHub rechazó la credencial. Autoriza GitHub CLI o proporciona un token de lectura válido.',
      401,
    );
  if (status === 403 || status === 429)
    return new AppError(
      'GitHub limitó la lectura o tu organización requiere autorización. Comprueba permisos y cuota, o abre una carpeta local.',
      status,
    );
  if (status === 404)
    return new AppError(
      'No se encontró el repositorio o tu cuenta no tiene acceso. Comprueba el propietario, la referencia y los permisos.',
      404,
    );
  return new AppError(
    'GitHub no pudo completar la lectura. Prueba otra vez o abre una copia local.',
    502,
  );
}
async function remote(
  endpoint: string,
  token: string | undefined,
  gh: boolean,
  raw = false,
): Promise<any> {
  if (!/^repos\/[\w.-]+\/[\w.-]+\//.test(endpoint) && !/^repos\/[\w.-]+\/[\w.-]+$/.test(endpoint))
    throw new AppError('Ruta de GitHub inválida.');
  if (gh) {
    try {
      const { stdout } = await execFileAsync(
        'gh',
        [
          'api',
          '--hostname',
          'github.com',
          '-H',
          'Accept: ' + (raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json'),
          endpoint,
        ],
        {
          timeout: 45000,
          maxBuffer: raw ? MAX_FILE_BYTES + 1024 : 10 * 1024 * 1024,
          encoding: 'utf8',
        },
      );
      return raw ? stdout : JSON.parse(stdout);
    } catch (error) {
      const status = String((error as { stderr?: string }).stderr || '').match(/HTTP (\d{3})/);
      throw githubError(status ? Number(status[1]) : 502);
    }
  }
  let response: Response;
  try {
    response = await fetch('https://api.github.com/' + endpoint, {
      headers: {
        Accept: raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      signal: AbortSignal.timeout(45000),
      redirect: 'error',
      cache: 'no-store',
    });
  } catch {
    throw new AppError('No se pudo conectar con GitHub. Revisa tu conexión.', 502);
  }
  if (!response.ok) throw githubError(response.status);
  const limit = raw ? MAX_FILE_BYTES : 10 * 1024 * 1024;
  const reader = response.body?.getReader();
  if (!reader) throw new AppError('GitHub devolvió una respuesta vacía.', 502);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError('La respuesta de GitHub supera el límite de lectura.');
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  const text = Buffer.concat(chunks).toString('utf8');
  if (raw) return text;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('GitHub devolvió una respuesta inválida.', 502);
  }
}
export async function readGithub(
  input: string,
  token: string | undefined,
  onProgress: Progress = () => {},
): Promise<ReadResult & { url: string; revision: string; name: string }> {
  const ref = githubRef(input),
    prefix = 'repos/' + ref.owner + '/' + ref.name;
  if (token && (token.length > 500 || /[\s\x00-\x1f]/.test(token)))
    throw new AppError('El token de GitHub tiene un formato inválido.');
  const gh = !token && (await hasGhAuth());
  onProgress('Localizando la revisión en GitHub…', 5);
  const metadata = await remote(prefix, token, gh);
  const commit = await remote(
    prefix + '/commits/' + encodeURIComponent(ref.ref || metadata.default_branch),
    token,
    gh,
  );
  const revision = commit.sha,
    treeSha = commit.commit?.tree?.sha;
  if (!/^[\da-f]{40}$/.test(revision) || !/^[\da-f]{40}$/.test(treeSha))
    throw new AppError('GitHub no devolvió una revisión válida.');
  const listing = await remote(prefix + '/git/trees/' + treeSha + '?recursive=1', token, gh);
  if (!Array.isArray(listing.tree))
    throw new AppError('GitHub no devolvió un inventario de fuentes.');
  const candidates = listing.tree.filter(
    (entry: any) =>
      entry.type === 'blob' &&
      entry.mode !== '120000' &&
      typeof entry.path === 'string' &&
      typeof entry.sha === 'string' &&
      entry.size <= MAX_FILE_BYTES &&
      entry.path
        .split('/')
        .every(
          (name: string, i: number, parts: string[]) => !excluded(name, i < parts.length - 1),
        ) &&
      eligible(path.basename(entry.path)),
  );
  candidates.sort((a: any, b: any) => {
    const score = (p: string) =>
      /^readme/i.test(p)
        ? 0
        : /^(?:package.json|pyproject.toml|go.mod|Cargo.toml)$/.test(p)
          ? 1
          : /\/(?:main|app|server|index|__init__)\./.test(p)
            ? 2
            : p.split('/').length + 2;
    return score(a.path) - score(b.path) || a.path.localeCompare(b.path);
  });
  const selected = candidates.slice(0, MAX_REMOTE_FILES);
  const result: ReadResult = {
    files: [],
    skipped: listing.tree.filter((e: any) => e.type === 'blob').length - selected.length,
    bytes: 0,
    limitations: [],
  };
  let cursor = 0,
    done = 0;
  const received = new Map<number, SourceFile>();
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(5, selected.length) }, async () => {
      while (cursor < selected.length && !failure) {
        const index = cursor++,
          entry = selected[index];
        try {
          const raw = await remote(prefix + '/git/blobs/' + entry.sha, token, gh, true);
          const file = textFile(
            entry.path,
            Buffer.from(raw),
            'https://github.com/' +
              metadata.full_name +
              '/blob/' +
              revision +
              '/' +
              entry.path.split('/').map(encodeURIComponent).join('/'),
          );
          if (file) received.set(index, file);
          else result.skipped++;
        } catch (error) {
          if (error instanceof AppError && [401, 403, 429].includes(error.status)) failure = error;
          else result.skipped++;
        }
        done++;
        onProgress(
          'Leyendo ' + done + ' de ' + selected.length + ' fuentes de GitHub…',
          10 + Math.round((done / Math.max(1, selected.length)) * 65),
        );
      }
    }),
  );
  if (failure) throw failure;
  for (const [, file] of [...received.entries()].sort((a, b) => a[0] - b[0])) {
    if (result.bytes + file.size > MAX_BYTES) {
      result.skipped++;
      continue;
    }
    result.files.push(file);
    result.bytes += file.size;
  }
  if (!result.files.length)
    throw new AppError(
      'No se pudieron leer fuentes compatibles. Comprueba el acceso a Contents o abre una carpeta local.',
    );
  if (candidates.length > MAX_REMOTE_FILES || listing.truncated)
    result.limitations.push(
      'Índice remoto parcial. Se leen hasta 500 fuentes por repositorio. Abre una copia local para ampliar el alcance.',
    );
  if (result.skipped)
    result.limitations.push(
      'Se omitieron ' +
        result.skipped +
        ' archivos por tamaño, formato, permisos o reglas de exclusión.',
    );
  result.limitations.push(
    'La lectura remota respeta exclusiones incorporadas. Para aplicar .gitignore y .tramaignore utiliza una carpeta local.',
  );
  return { ...result, url: ref.url, revision, name: String(metadata.name || ref.name) };
}
export const EXAMPLES = [
  {
    id: 'pedidos',
    name: 'Pedidos',
    description: 'Sigue una solicitud, una transacción y el procesamiento de un evento.',
  },
  {
    id: 'data-pipeline',
    name: 'Informe de ventas',
    description: 'Reconstruye un resultado desde su origen y cambia una regla de agregación.',
  },
];
export async function importRepository(
  request: ImportRequest,
  store: Store,
  onProgress: Progress = () => {},
): Promise<Snapshot> {
  if (!['local', 'github', 'example'].includes(request.kind))
    throw new AppError('Elige una carpeta, un repositorio de GitHub o un ejemplo.');
  let result: ReadResult, name: string, location: string, revision: string;
  if (request.kind === 'github') {
    if (typeof request.repo !== 'string') throw new AppError('Falta la dirección del repositorio.');
    const remote = await readGithub(request.repo, request.token, onProgress);
    result = remote;
    name = remote.name;
    location = remote.url;
    revision = remote.revision;
  } else {
    const local =
      request.kind === 'example' ? EXAMPLES.find((e) => e.id === request.example) : null;
    if (request.kind === 'example' && !local) throw new AppError('El ejemplo no existe.', 404);
    const input = local
      ? path.resolve(process.env.TRAMA_APP_ROOT || process.cwd(), 'examples', local.id)
      : request.path;
    if (typeof input !== 'string') throw new AppError('Falta la ruta absoluta del repositorio.');
    onProgress('Leyendo el inventario local…', 5);
    const read = await readLocal(input, onProgress);
    result = read;
    name = local?.name || path.basename(read.root);
    location = read.root;
    const content = hash(read.files.map((f) => f.path + '\0' + f.hash).join('\n'));
    let head = '';
    try {
      const out = await execFileAsync(
        'git',
        [
          '-c',
          'core.fsmonitor=false',
          '-c',
          'core.hooksPath=/dev/null',
          '-C',
          read.root,
          'rev-parse',
          '--verify',
          'HEAD',
        ],
        { timeout: 5000, maxBuffer: 4096 },
      );
      if (/^[a-f\d]{40,64}$/.test(out.stdout.trim())) head = out.stdout.trim();
    } catch {}
    revision = head ? head.slice(0, 12) + '+' + content.slice(0, 12) : content;
  }
  result.files.sort((a, b) => a.path.localeCompare(b.path));
  const projectId = hash(request.kind + '|' + location).slice(0, 24);
  const snapshotId = hash(
    projectId + '|' + revision + '|' + result.files.map((f) => f.path + '\0' + f.hash).join('\n'),
  ).slice(0, 32);
  const existing = store.snapshot(snapshotId);
  if (existing) {
    onProgress('Esta revisión ya está en tu biblioteca.', 100);
    return store.save({ ...existing, files: store.files(existing.id) });
  }
  onProgress('Relacionando componentes y procesos…', 80);
  const coverage = {
    indexed: result.files.length,
    skipped: result.skipped,
    bytes: result.bytes,
    limitations: result.limitations,
  };
  const plan = build({
    id: projectId,
    title: name,
    slug: name,
    description: '',
    revision,
    origin: request.kind === 'github' ? 'github' : 'folder',
    url: request.kind === 'github' ? location : '',
    files: result.files,
    tree: result.files.map((f) => ({ path: f.path, size: f.size })),
    coverage,
  }) as Plan;
  validatePlan(plan, result.files);
  onProgress('Construyendo las conexiones entre archivos…', 90);
  const graph = buildGraph(result.files);
  const unresolved = graph.nodes.filter((node) => node.kind === 'unparsed').length;
  if (unresolved)
    coverage.limitations.push(
      unresolved + ' archivos requieren revisión manual porque su estructura no pudo analizarse.',
    );
  const snapshot = store.save({
    id: snapshotId,
    projectId,
    name,
    source: request.kind,
    location,
    revision,
    coverage,
    plan,
    graph,
    files: result.files,
  });
  onProgress('Tu espacio está listo.', 100);
  return snapshot;
}
