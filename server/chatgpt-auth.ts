import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { chmod, mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { LearningError } from './provider.js';

// Original implementation of the documented public-client protocol. No SDK source
// or credentials from another application are used.
const ISSUER = 'https://auth.openai.com';
const AUTHORIZE = ISSUER + '/api/accounts/authorize';
const TOKEN = ISSUER + '/api/accounts/oauth/token';
const DISCOVERY = ISSUER + '/.well-known/openid-configuration';
const JWKS = ISSUER + '/.well-known/jwks.json';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const DIRECT = 'chatgpt.tokens.use.direct';
const CALLBACK_PATH = '/auth/callback';
const tokenText = z.string().min(1).max(32768);
const clientText = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{1,255}$/)
  .refine((value) => value !== 'dynamic_agent_client');
const credentialsSchema = z
  .object({
    accessToken: tokenText.optional(),
    refreshToken: tokenText.optional(),
    idToken: tokenText,
    expiresAt: z.number().finite().positive(),
    earliestRefreshAt: z.number().finite().nonnegative().optional(),
    scopes: z.array(z.string().max(200)).max(50),
  })
  .strict();
const profileSchema = z
  .object({
    id: z.string().uuid(),
    clientId: clientText,
    subject: z.string().min(1).max(1024).optional(),
    email: z.string().max(512).optional(),
    credentials: credentialsSchema.optional(),
    pendingCredentials: credentialsSchema.optional(),
    pendingNeedsIdentity: z.boolean().optional(),
  })
  .strict();
const stateSchema = z
  .object({
    version: z.literal(1),
    hostId: z.string().regex(/^urn:uuid:[a-f0-9-]{36}$/),
    profiles: z.array(profileSchema).max(25),
    activeId: z.string().uuid().optional(),
    lastProfileId: z.string().uuid().optional(),
  })
  .strict();
type AuthState = z.infer<typeof stateSchema>;
type Profile = z.infer<typeof profileSchema>;
type Credentials = z.infer<typeof credentialsSchema>;

export interface AuthStatus {
  available: boolean;
  connected: boolean;
  sharing: boolean;
  profileId?: string;
  email?: string;
  phase: 'idle' | 'connecting' | 'connected' | 'error';
  authUrl?: string;
  error?: string;
  errorCode?: string;
  storage: 'encrypted' | 'unavailable';
  profiles: { id: string; email?: string; connected: boolean }[];
}
export interface SignInOptions {
  profileId?: string;
  newAccount?: boolean;
  enableSharing?: boolean;
}
interface UtilityPort {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (event: { data: unknown }) => void): void;
  off(event: 'message', listener: (event: { data: unknown }) => void): void;
}
type SecretOperation = 'available' | 'encrypt' | 'decrypt';
interface AuthOptions {
  fetch?: typeof fetch;
  now?: () => number;
  authorizationTimeoutMs?: number;
  // Dependency injection is constructor-only and is never accepted from an API body.
  secret?: (operation: SecretOperation, value?: string) => Promise<string>;
}
interface Attempt {
  id: string;
  state: string;
  nonce: string;
  verifier: string;
  profileId: string;
  clientId?: string;
  subject?: string;
  callback: string;
  url: string;
  server: Server;
  controller: AbortController;
  reject: (error: Error) => void;
  claimed: boolean;
}

function error(message: string, code: string, status = 400): LearningError {
  return new LearningError(message, status, code);
}
function equalsSecret(left: string, right: string): boolean {
  const a = Buffer.from(left),
    b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function credentialBridge(operation: SecretOperation, value?: string): Promise<string> {
  const port = (process as NodeJS.Process & { parentPort?: UtilityPort }).parentPort;
  if (!port)
    return Promise.reject(
      error('No está disponible el almacén seguro de macOS.', 'chatgpt_storage_unavailable', 503),
    );
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const finish = (result?: string) => {
      clearTimeout(timeout);
      port.off('message', listener);
      if (result === undefined)
        reject(
          error('No se pudo abrir el almacén seguro de macOS.', 'chatgpt_storage_unavailable', 503),
        );
      else resolve(result);
    };
    const listener = (event: { data: unknown }) => {
      const message = event.data as { type?: string; id?: string; value?: string };
      if (message?.type === 'trama:secret-result' && message.id === id)
        finish(typeof message.value === 'string' ? message.value : undefined);
    };
    const timeout = setTimeout(() => finish(), 15000);
    timeout.unref();
    port.on('message', listener);
    port.postMessage({ type: 'trama:secret', id, operation, value });
  });
}

export class ChatGPTAuth {
  private readonly path: string;
  private readonly lockPath: string;
  private readonly transport: typeof fetch;
  private readonly now: () => number;
  private readonly secret?: AuthOptions['secret'];
  private readonly verifyKey: ReturnType<typeof createRemoteJWKSet>;
  private readonly ready: Promise<void>;
  private saved!: AuthState;
  private initializationError?: LearningError;
  private attempt?: Attempt;
  private starting = false;
  private generation = 0;
  private lastError?: LearningError;
  private activeRequests = new Set<AbortController>();
  private authorizationTimeoutMs: number;

  constructor(
    private readonly dataDir: string,
    options: AuthOptions = {},
  ) {
    this.path = join(dataDir, 'chatgpt-auth.json');
    this.lockPath = join(dataDir, 'chatgpt-auth.lock');
    this.transport = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.secret =
      options.secret ?? (process.env.TRAMA_DESKTOP === '1' ? credentialBridge : undefined);
    this.authorizationTimeoutMs = options.authorizationTimeoutMs ?? 5 * 60_000;
    this.verifyKey = createRemoteJWKSet(new URL(JWKS), {
      [customFetch]: (input, init) => this.transport(input, { ...init, redirect: 'error' }),
      timeoutDuration: 10000,
    });
    this.ready = this.initialize().catch(() => {
      this.initializationError = error(
        'No se pudieron leer las credenciales de ChatGPT. Revisa el acceso al almacén local.',
        'chatgpt_storage_unavailable',
        503,
      );
    });
  }

  private async initialize() {
    if (!this.secret) throw new Error('ChatGPT requires the desktop secure store');
    await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
    if (this.secret) await this.secret('available');
    await this.lock(async () => {
      try {
        this.saved = await this.read();
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'ENOENT') throw cause;
        this.saved = { version: 1, hostId: 'urn:uuid:' + randomUUID(), profiles: [] };
        await this.write();
      }
    });
  }
  private async ensureReady() {
    await this.ready;
    if (this.initializationError) throw this.initializationError;
  }
  private async read(): Promise<AuthState> {
    const info = await stat(this.path);
    if (info.size > 262144) throw new Error('Invalid credential file');
    const document = JSON.parse(await readFile(this.path, 'utf8')) as Record<string, unknown>;
    let data: unknown;
    if (document.format === 'trama-chatgpt-keychain-v1') {
      if (!this.secret || typeof document.data !== 'string')
        throw new Error('Unavailable secure storage');
      data = JSON.parse(await this.secret('decrypt', document.data));
    } else {
      throw new Error('Expected encrypted credentials');
    }
    return stateSchema.parse(data);
  }
  private async write(guard?: () => boolean) {
    const payload = JSON.stringify(this.saved);
    if (!this.secret) throw new Error('Secure storage unavailable');
    const body = JSON.stringify({
      format: 'trama-chatgpt-keychain-v1',
      data: await this.secret('encrypt', payload),
    });
    if (Buffer.byteLength(body) > 262144)
      throw error(
        'Se alcanzó el límite del almacén local de cuentas.',
        'chatgpt_storage_limit',
        413,
      );
    if (guard && !guard()) throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
    const temp = this.path + '.' + randomUUID() + '.tmp';
    try {
      const file = await open(temp, 'wx', 0o600);
      try {
        await file.writeFile(body + '\n');
        await file.sync();
      } finally {
        await file.close();
      }
      if (guard && !guard()) throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
      await rename(temp, this.path);
      await chmod(this.path, 0o600);
    } finally {
      await rm(temp, { force: true });
    }
  }
  private async lock<T>(operation: () => Promise<T>): Promise<T> {
    const started = Date.now(),
      id = randomUUID();
    while (true) {
      try {
        const handle = await open(this.lockPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify({ pid: process.pid, id }));
        await handle.close();
        break;
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== 'EEXIST') throw cause;
        // Recover a lock only when its recorded process no longer exists.
        try {
          const owner = JSON.parse(await readFile(this.lockPath, 'utf8')) as { pid?: number };
          if (Number.isInteger(owner.pid) && owner.pid! > 0) {
            try {
              process.kill(owner.pid!, 0);
            } catch (check) {
              if ((check as NodeJS.ErrnoException).code === 'ESRCH') {
                await rm(this.lockPath, { force: true });
                continue;
              }
            }
          }
        } catch {
          /* Another process may be creating or removing its lock. */
        }
        if (Date.now() - started > 30000)
          throw error(
            'Otra ventana está renovando la conexión. Vuelve a intentarlo.',
            'chatgpt_auth_busy',
            409,
          );
        await delay(40);
      }
    }
    try {
      return await operation();
    } finally {
      try {
        const owner = JSON.parse(await readFile(this.lockPath, 'utf8')) as { id?: string };
        if (owner.id === id) await rm(this.lockPath, { force: true });
      } catch {
        /* A missing lock must not expose credentials through diagnostics. */
      }
    }
  }
  private async mutate<T>(operation: () => Promise<T>): Promise<T> {
    return this.lock(async () => {
      this.saved = await this.read();
      return operation();
    });
  }
  async status(): Promise<AuthStatus> {
    await this.ready;
    let saved = this.saved;
    if (!this.initializationError) {
      try {
        saved = await this.read();
      } catch {
        this.lastError = error(
          'No se pudo leer la conexión guardada.',
          'chatgpt_storage_unavailable',
          503,
        );
      }
    }
    const profile = saved?.profiles.find((p) => p.id === saved.activeId);
    const connected = !!profile?.credentials;
    const failure = this.initializationError ?? this.lastError;
    return {
      available: !this.initializationError,
      connected,
      sharing:
        !!profile?.credentials?.scopes.includes(DIRECT) && !!profile?.credentials.accessToken,
      profileId: profile?.id,
      email: profile?.email,
      phase:
        this.attempt || this.starting
          ? 'connecting'
          : failure
            ? 'error'
            : connected
              ? 'connected'
              : 'idle',
      authUrl: this.attempt?.url,
      error: failure?.message,
      errorCode: failure?.code,
      storage: this.secret && !this.initializationError ? 'encrypted' : 'unavailable',
      profiles:
        saved?.profiles.map((p) => ({ id: p.id, email: p.email, connected: !!p.credentials })) ??
        [],
    };
  }

  async start(options: SignInOptions = {}): Promise<void> {
    if (this.attempt || this.starting)
      throw error('Ya hay una conexión de ChatGPT en curso.', 'chatgpt_auth_busy', 409);
    this.starting = true;
    this.lastError = undefined;
    const generation = ++this.generation;
    let server: Server | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.ensureReady();
      if (generation !== this.generation) return;
      const saved = await this.read();
      const profileId = options.newAccount
        ? undefined
        : (options.profileId ?? saved.activeId ?? saved.lastProfileId);
      const profile = profileId ? saved.profiles.find((p) => p.id === profileId) : undefined;
      if (options.profileId && !profile)
        throw error('Esta cuenta guardada ya no existe.', 'chatgpt_profile_changed', 409);
      if (!profile && saved.profiles.length >= 25)
        throw error('Se alcanzó el límite de cuentas guardadas.', 'chatgpt_profiles_limit');
      const state = randomBytes(32).toString('base64url');
      const nonce = randomBytes(32).toString('base64url');
      const verifier = randomBytes(48).toString('base64url');
      let resolve!: () => void, reject!: (error: Error) => void;
      const done = new Promise<void>((ok, fail) => {
        resolve = ok;
        reject = fail;
      });
      // Attach before any asynchronous setup to avoid an unhandled cancellation rejection.
      void done.catch(() => undefined);
      server = createServer((request, response) => {
        response.setHeader('Content-Type', 'text/plain; charset=utf-8');
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
        const attempt = this.attempt;
        let url: URL;
        try {
          url = new URL(request.url || '/', attempt?.callback ?? 'http://127.0.0.1');
        } catch {
          response.writeHead(400).end('Solicitud inválida.');
          return;
        }
        if (
          !attempt ||
          (request.url?.length ?? 0) > 16384 ||
          request.method !== 'GET' ||
          request.headers.host !== new URL(attempt.callback).host ||
          url.origin !== new URL(attempt.callback).origin ||
          url.pathname !== CALLBACK_PATH
        ) {
          response.writeHead(404).end('No encontrado.');
          return;
        }
        if (
          ['state', 'code', 'client_id', 'error'].some(
            (key) => url.searchParams.getAll(key).length > 1,
          )
        ) {
          response.writeHead(400).end('Solicitud ambigua.');
          return;
        }
        const returnedState = url.searchParams.get('state') ?? '';
        if (returnedState.length > 256 || !equalsSecret(returnedState, attempt.state)) {
          response.writeHead(400).end('La respuesta no pertenece a esta conexión.');
          return;
        }
        if (attempt.claimed) {
          response.writeHead(409).end('Esta respuesta ya fue procesada.');
          return;
        }
        attempt.claimed = true;
        void this.callback(attempt, url).then(
          () => {
            response
              .writeHead(200)
              .end('Conexión completada. Puedes cerrar esta pestaña y volver a Trama.', resolve);
          },
          (cause) => {
            response
              .writeHead(400)
              .end('No se completó la conexión. Vuelve a Trama para intentarlo de nuevo.', () =>
                reject(
                  cause instanceof LearningError
                    ? cause
                    : error('No se pudo verificar la conexión de ChatGPT.', 'chatgpt_auth_failed'),
                ),
              );
          },
        );
      });
      server.maxHeadersCount = 30;
      server.requestTimeout = 20000;
      server.headersTimeout = 10000;
      await new Promise<void>((ok, fail) => {
        server!.once('error', fail);
        server!.listen(0, '127.0.0.1', ok);
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Listener unavailable');
      const callback = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`;
      const url = new URL(AUTHORIZE);
      const parameters: Record<string, string> = {
        client_id: profile?.clientId ?? 'dynamic_agent_client',
        ext_agent_host_id: saved.hostId,
        response_type: 'code',
        redirect_uri: callback,
        scope: SCOPES,
        resource: RESOURCE,
        state,
        nonce,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
      };
      if (!profile) parameters.agent_name_hint = 'Trama';
      if (profile?.email) parameters.login_hint = profile.email;
      if (options.enableSharing) parameters.prompt = 'consent';
      // ID tokens are retained only in protected storage; omit the optional browser hint
      // so the authorization URL returned to the renderer contains no credential.
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value);
      if (generation !== this.generation)
        throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
      this.attempt = {
        id: randomUUID(),
        state,
        nonce,
        verifier,
        profileId: profile?.id ?? randomUUID(),
        clientId: profile?.clientId,
        subject: profile?.subject,
        callback,
        url: url.href,
        server,
        controller: new AbortController(),
        reject,
        claimed: false,
      };
      this.starting = false;
      timer = setTimeout(() => {
        this.attempt?.controller.abort();
        reject(
          error(
            'Se agotó el tiempo para conectar ChatGPT. Puedes volver a intentarlo.',
            'chatgpt_auth_timeout',
            408,
          ),
        );
      }, this.authorizationTimeoutMs);
      timer.unref();
      await done;
    } catch (cause) {
      if (generation === this.generation) {
        this.lastError =
          cause instanceof LearningError
            ? cause
            : error(
                'No se pudo conectar ChatGPT. Vuelve a intentarlo.',
                'chatgpt_auth_failed',
                502,
              );
        throw this.lastError;
      }
    } finally {
      if (timer) clearTimeout(timer);
      server?.closeAllConnections();
      server?.close();
      if (generation === this.generation) {
        this.attempt = undefined;
        this.starting = false;
      }
    }
  }

  private async callback(attempt: Attempt, url: URL) {
    const oauthError = url.searchParams.get('error');
    if (oauthError)
      throw error(
        oauthError === 'access_denied'
          ? 'No autorizaste la conexión de ChatGPT.'
          : 'ChatGPT no pudo completar la autorización.',
        oauthError === 'access_denied' ? 'chatgpt_access_denied' : 'chatgpt_auth_failed',
      );
    const suppliedClient = url.searchParams.get('client_id');
    const clientId = attempt.clientId ?? suppliedClient;
    if (
      !clientId ||
      !clientText.safeParse(clientId).success ||
      (attempt.clientId && suppliedClient && suppliedClient !== attempt.clientId)
    )
      throw error(
        'La respuesta de ChatGPT no coincide con el registro seleccionado.',
        'chatgpt_invalid_client',
      );
    const code = url.searchParams.get('code');
    if (!code || code.length > 8192)
      throw error('La autorización no incluyó un código válido.', 'chatgpt_invalid_code');
    // Persist registration before exchanging a one-time code. A failed exchange must
    // not cause duplicate dynamic registrations on the next attempt.
    await this.mutate(async () => {
      if (this.attempt !== attempt || attempt.controller.signal.aborted)
        throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
      let profile = this.saved.profiles.find((p) => p.id === attempt.profileId);
      if (!profile) {
        profile = { id: attempt.profileId, clientId };
        this.saved.profiles.push(profile);
      }
      if (profile.clientId !== clientId)
        throw error('El registro de cuenta cambió.', 'chatgpt_profile_changed', 409);
      this.saved.lastProfileId = profile.id;
      await this.write();
    });
    const raw = await this.tokenRequest(
      {
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        code_verifier: attempt.verifier,
        redirect_uri: attempt.callback,
        resource: RESOURCE,
      },
      attempt.controller.signal,
    );
    const identity = await this.verifyIdentity(raw.id_token, clientId, attempt.nonce);
    if (attempt.subject && identity.sub !== attempt.subject)
      throw error(
        'La cuenta autorizada no coincide con la cuenta guardada.',
        'chatgpt_identity_mismatch',
        403,
      );
    const credentials = this.parseCredentials(raw);
    await this.mutate(async () => {
      if (this.attempt !== attempt || attempt.controller.signal.aborted)
        throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
      const profile = this.saved.profiles.find((p) => p.id === attempt.profileId);
      if (
        !profile ||
        profile.clientId !== clientId ||
        (profile.subject && profile.subject !== identity.sub)
      )
        throw error(
          'La cuenta guardada cambió durante la conexión.',
          'chatgpt_profile_changed',
          409,
        );
      const prior = structuredClone(this.saved);
      profile.subject = identity.sub!;
      profile.email = typeof identity.email === 'string' ? identity.email.slice(0, 512) : undefined;
      profile.credentials = credentials;
      this.saved.activeId = profile.id;
      this.saved.lastProfileId = profile.id;
      const current = () => this.attempt === attempt && !attempt.controller.signal.aborted;
      try {
        await this.write(current);
        if (!current()) throw error('Conexión cancelada.', 'chatgpt_auth_cancelled');
      } catch (cause) {
        // A cancellation can arrive while the atomic rename is in flight. Keep the
        // disk lock until the previous state has been restored, before any request
        // can obtain the newly issued credentials.
        this.saved = prior;
        await this.write();
        throw cause;
      }
      for (const controller of this.activeRequests) controller.abort();
    });
  }
  private async verifyIdentity(
    token: unknown,
    clientId: string,
    nonce?: string,
  ): Promise<JWTPayload> {
    if (!tokenText.safeParse(token).success)
      throw error(
        'ChatGPT no devolvió una identidad verificable.',
        'chatgpt_invalid_identity',
        502,
      );
    try {
      const { payload } = await jwtVerify(token as string, this.verifyKey, {
        issuer: ISSUER,
        audience: clientId,
        algorithms: ['RS256'],
        requiredClaims: ['sub', 'exp', 'iat', ...(nonce ? ['nonce'] : [])],
        clockTolerance: 5,
        currentDate: new Date(this.now()),
      });
      if (
        typeof payload.sub !== 'string' ||
        !payload.sub ||
        payload.sub.length > 1024 ||
        (payload.azp !== undefined && payload.azp !== clientId) ||
        (Array.isArray(payload.aud) && payload.aud.length > 1 && payload.azp !== clientId) ||
        (nonce && (typeof payload.nonce !== 'string' || !equalsSecret(payload.nonce, nonce)))
      )
        throw new Error('Identity mismatch');
      return payload;
    } catch (cause) {
      const code = (cause as { code?: string }).code;
      if (
        code === 'ERR_JWKS_TIMEOUT' ||
        code === 'ERR_JWKS_NO_MATCHING_KEY' ||
        (!code && !(cause instanceof Error && cause.message === 'Identity mismatch'))
      )
        throw error(
          'No se pudo comprobar la identidad de ChatGPT. Conservamos la sesión para reintentarlo.',
          'chatgpt_identity_unavailable',
          503,
        );
      throw error(
        'No se pudo verificar la identidad firmada por ChatGPT.',
        'chatgpt_invalid_identity',
        403,
      );
    }
  }
  private async json(response: Response): Promise<Record<string, unknown>> {
    if (!response.body) throw new Error('Missing response');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        length += part.value.byteLength;
        if (length > 131072) throw new Error('Response too large');
        chunks.push(part.value);
      }
    } finally {
      await reader.cancel();
    }
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('Invalid response');
    return value;
  }
  private async tokenRequest(
    parameters: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    try {
      const response = await this.transport(TOKEN, {
        method: 'POST',
        redirect: 'error',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(parameters),
        signal: AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]),
      });
      const body = await this.json(response);
      if (!response.ok) {
        if (
          typeof body.error === 'string' &&
          [
            'invalid_grant',
            'invalid_refresh_token',
            'token_expired',
            'refresh_token_expired',
            'refresh_token_invalidated',
            'refresh_token_reused',
          ].includes(body.error)
        )
          throw error(
            'La sesión de ChatGPT requiere volver a iniciar sesión.',
            'chatgpt_reauthentication_required',
            401,
          );
        if (body.error === 'invalid_client')
          throw error(
            'ChatGPT no reconoce el registro de esta aplicación.',
            'chatgpt_invalid_client',
            401,
          );
        throw error(
          'ChatGPT no pudo renovar la conexión. Vuelve a intentarlo.',
          'chatgpt_token_unavailable',
          response.status >= 500 ? 503 : 401,
        );
      }
      return body;
    } catch (cause) {
      if (cause instanceof LearningError) throw cause;
      throw error(
        signal?.aborted
          ? 'La solicitud de ChatGPT fue cancelada.'
          : 'No se pudo contactar con el servicio de autenticación de ChatGPT.',
        signal?.aborted ? 'chatgpt_cancelled' : 'chatgpt_auth_network',
        503,
      );
    }
  }
  private parseCredentials(raw: Record<string, unknown>, previous?: Credentials): Credentials {
    const scope =
      typeof raw.scope === 'string'
        ? raw.scope.trim().split(/\s+/).filter(Boolean)
        : (previous?.scopes ?? []);
    const identityOnly = !scope.includes(DIRECT) && raw.access_token === undefined;
    const expiresIn = identityOnly && raw.expires_in === undefined ? 3600 : raw.expires_in;
    if (
      (!identityOnly &&
        (typeof raw.token_type !== 'string' || raw.token_type.toLowerCase() !== 'bearer')) ||
      typeof expiresIn !== 'number' ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0 ||
      expiresIn > 86400 ||
      (scope.includes(DIRECT) && !tokenText.safeParse(raw.access_token).success)
    )
      throw error('ChatGPT devolvió una sesión incompleta.', 'chatgpt_invalid_tokens', 502);
    let earliestRefreshAt: number | undefined;
    if (typeof raw.earliest_refresh_at === 'number')
      earliestRefreshAt =
        raw.earliest_refresh_at > 1e12 ? raw.earliest_refresh_at : raw.earliest_refresh_at * 1000;
    else if (typeof raw.earliest_refresh_at === 'string') {
      const date = Date.parse(raw.earliest_refresh_at);
      if (Number.isFinite(date)) earliestRefreshAt = date;
    }
    const value = credentialsSchema.safeParse({
      accessToken: raw.access_token,
      refreshToken: raw.refresh_token,
      idToken: raw.id_token ?? previous?.idToken,
      expiresAt: this.now() + expiresIn * 1000,
      earliestRefreshAt,
      scopes: scope,
    });
    if (!value.success)
      throw error('ChatGPT devolvió una sesión incompleta.', 'chatgpt_invalid_tokens', 502);
    return value.data;
  }

  cancel(): void {
    this.generation++;
    this.starting = false;
    const attempt = this.attempt;
    this.attempt = undefined;
    attempt?.controller.abort();
    attempt?.reject(error('Conexión cancelada.', 'chatgpt_auth_cancelled'));
    attempt?.server.closeAllConnections();
    attempt?.server.close();
    this.lastError = undefined;
  }
  private async acceptPending(profile: Profile) {
    const pending = profile.pendingCredentials;
    if (!pending) return;
    if (profile.pendingNeedsIdentity !== false) {
      const identity = await this.verifyIdentity(pending.idToken, profile.clientId);
      if (identity.sub !== profile.subject)
        throw error('La identidad cambió al renovar la sesión.', 'chatgpt_identity_mismatch', 403);
    }
    profile.credentials = pending;
    delete profile.pendingCredentials;
    delete profile.pendingNeedsIdentity;
    await this.write();
  }
  async withAccess<T>(
    expectedProfileId: string,
    operation: (accessToken: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    await this.ensureReady();
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    this.activeRequests.add(controller);
    try {
      combined.throwIfAborted();
      const token = await this.mutate(async () => {
        const profile = this.saved.profiles.find((p) => p.id === this.saved.activeId);
        if (!profile?.credentials || profile.id !== expectedProfileId)
          throw error(
            'La cuenta de ChatGPT cambió. Revisa la conexión antes de enviar código.',
            'chatgpt_profile_changed',
            409,
          );
        if (profile.pendingCredentials) {
          try {
            await this.acceptPending(profile);
          } catch (cause) {
            if (
              cause instanceof LearningError &&
              ['chatgpt_invalid_identity', 'chatgpt_identity_mismatch'].includes(cause.code)
            ) {
              delete profile.credentials;
              delete profile.pendingCredentials;
              delete profile.pendingNeedsIdentity;
              await this.write();
            }
            throw cause;
          }
        }
        if (!profile.credentials.scopes.includes(DIRECT) || !profile.credentials.accessToken)
          throw error(
            'Activa el uso de tu plan en los permisos de ChatGPT.',
            'chatgpt_sharing_disabled',
            403,
          );
        const credentials = profile.credentials;
        if (
          credentials.expiresAt <= this.now() + 60000 &&
          (!credentials.earliestRefreshAt || credentials.earliestRefreshAt <= this.now())
        ) {
          try {
            if (!credentials.refreshToken)
              throw error(
                'La sesión de ChatGPT requiere volver a iniciar sesión.',
                'chatgpt_reauthentication_required',
                401,
              );
            const raw = await this.tokenRequest(
              {
                grant_type: 'refresh_token',
                client_id: profile.clientId,
                refresh_token: credentials.refreshToken,
                resource: RESOURCE,
              },
              combined,
            );
            profile.pendingCredentials = this.parseCredentials(raw, credentials);
            profile.pendingNeedsIdentity = raw.id_token !== undefined;
            // Refresh tokens rotate. Preserve the replacement before a JWKS lookup
            // can fail transiently, but do not expose it to inference until verified.
            await this.write();
            combined.throwIfAborted();
            await this.acceptPending(profile);
          } catch (cause) {
            if (
              cause instanceof LearningError &&
              [
                'chatgpt_reauthentication_required',
                'chatgpt_identity_mismatch',
                'chatgpt_invalid_identity',
              ].includes(cause.code)
            ) {
              delete profile.credentials;
              delete profile.pendingCredentials;
              delete profile.pendingNeedsIdentity;
              await this.write();
              this.lastError = cause;
            }
            throw cause;
          }
        }
        if (profile.credentials.expiresAt <= this.now())
          throw error(
            'ChatGPT todavía no permite renovar esta sesión. Vuelve a intentarlo.',
            'chatgpt_refresh_pending',
            503,
          );
        if (!profile.credentials.scopes.includes(DIRECT) || !profile.credentials.accessToken)
          throw error(
            'El uso del plan de ChatGPT ya no está autorizado.',
            'chatgpt_sharing_disabled',
            403,
          );
        return profile.credentials.accessToken;
      });
      combined.throwIfAborted();
      return await operation(token, combined);
    } finally {
      this.activeRequests.delete(controller);
    }
  }
  async disconnect(): Promise<void> {
    await this.ensureReady();
    this.cancel();
    for (const controller of this.activeRequests) controller.abort();
    await this.mutate(async () => {
      const profile = this.saved.profiles.find((p) => p.id === this.saved.activeId);
      let confirmed = true;
      if (profile?.credentials) {
        confirmed = await this.revoke(profile);
        delete profile.credentials;
        delete profile.pendingCredentials;
        delete profile.pendingNeedsIdentity;
      }
      delete this.saved.activeId;
      await this.write();
      if (!confirmed)
        this.lastError = error(
          'Sesión cerrada en Trama. No pudimos confirmar la revocación remota; puedes desconectar la aplicación en Ajustes de ChatGPT.',
          'chatgpt_revocation_unconfirmed',
          503,
        );
    });
  }
  private async revoke(profile: Profile): Promise<boolean> {
    const refreshToken =
      profile.pendingCredentials?.refreshToken ?? profile.credentials?.refreshToken;
    if (!refreshToken) return true;
    try {
      const discovery = await this.transport(DISCOVERY, {
        redirect: 'error',
        signal: AbortSignal.timeout(5000),
      });
      if (!discovery.ok) return false;
      const metadata = await this.json(discovery);
      if (
        metadata.issuer !== ISSUER ||
        metadata.revocation_endpoint !== ISSUER + '/api/accounts/oauth/revoke'
      )
        return false;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await this.transport(metadata.revocation_endpoint as string, {
            method: 'POST',
            redirect: 'error',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              token: refreshToken,
              token_type_hint: 'refresh_token',
              client_id: profile.clientId,
            }),
            signal: AbortSignal.timeout(5000),
          });
          await response.body?.cancel();
          if (response.status === 200) return true;
          if (response.status < 500) return false;
        } catch {
          /* Retry once without exposing token-bearing request details. */
        }
        if (attempt === 0) await delay(250);
      }
    } catch {
      /* Local logout still completes when remote revocation is unavailable. */
    }
    return false;
  }
}
