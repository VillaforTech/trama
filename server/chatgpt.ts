import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { LearningError } from './provider.js';
import { ChatGPTAuth } from './chatgpt-auth.js';
import type { ChatGPTModel, ChatGPTStatus } from '../shared/learning.js';

// Original implementation of the public Sign in with ChatGPT protocol.
// https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference
const API = 'https://api.openai.com/v1';
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';
const MAX_STREAM_BYTES = 1_000_000;
const REQUEST_TIMEOUT_MS = 90_000;

type AuthStatus = Omit<ChatGPTStatus, 'model' | 'models' | 'usageUrl' | 'welcomeSeen'>;
export interface ChatGPTAuthPort {
  status(): Promise<AuthStatus>;
  start(options?: {
    profileId?: string;
    newAccount?: boolean;
    enableSharing?: boolean;
  }): Promise<void>;
  cancel(): void | Promise<void>;
  disconnect(): Promise<void>;
  withAccess<T>(
    profileId: string,
    operation: (accessToken: string, signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T>;
}
interface Preferences {
  model: string;
  welcomeSeen: boolean;
}
interface ErrorDetails {
  requestId?: string;
  param?: string;
  responseShape?: string;
}
export class ChatGPTServiceError extends LearningError {
  constructor(
    message: string,
    status: number,
    code: string,
    readonly details: ErrorDetails = {},
  ) {
    super(message, status, code);
  }
}
function safeIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[\w.:/\[\]-]{1,180}$/.test(value) ? value : undefined;
}
function serviceFailure(status: number, payload: unknown, requestId?: string): ChatGPTServiceError {
  const data = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const error =
    data.error && typeof data.error === 'object' ? (data.error as Record<string, unknown>) : {};
  const code = safeIdentifier(error.code) || 'chatgpt_request_failed';
  const messages: Record<string, string> = {
    subscription_sharing_usage_limit_exceeded:
      'Se alcanzó un límite de uso de ChatGPT o de Trama. Revisa Administrar uso antes de consultar otra vez.',
    subscription_sharing_user_not_eligible:
      'La cuenta o el espacio seleccionado no tiene acceso al uso de su plan desde esta aplicación.',
    subscription_sharing_usage_unavailable:
      'ChatGPT no pudo comprobar el uso disponible. Conservamos la conexión; vuelve a intentarlo más tarde.',
    subscription_sharing_user_unavailable:
      'La información de la cuenta no está disponible temporalmente. Vuelve a intentarlo más tarde.',
    subscription_sharing_unsupported_capability:
      'Este modelo o formato no está disponible mediante el plan de ChatGPT. Revisa el modelo seleccionado.',
    subscription_sharing_route_not_supported:
      'ChatGPT no admite esta operación mediante el plan seleccionado.',
    subscription_sharing_invalid_user:
      'ChatGPT no pudo validar esta sesión. Vuelve a iniciar sesión.',
    chatpass_v2_scope_not_authorized:
      'La conexión no tiene permiso para usar el plan de ChatGPT. Revisa la autorización.',
    chatpass_v2_invalid_authorization_context:
      'ChatGPT no pudo confirmar la autorización de esta conexión.',
  };
  const fallback =
    status === 401
      ? 'ChatGPT rechazó la sesión. Vuelve a iniciar sesión.'
      : status === 403
        ? 'ChatGPT no permite esta solicitud para la cuenta, región o espacio seleccionado.'
        : status === 429
          ? 'ChatGPT alcanzó un límite. Revisa Administrar uso antes de continuar.'
          : 'ChatGPT no pudo completar la solicitud. Tu conexión se conserva; vuelve a intentarlo más tarde.';
  return new ChatGPTServiceError(messages[code] || fallback, status, code, {
    requestId: safeIdentifier(requestId),
    param: safeIdentifier(error.param),
    responseShape: data.error ? 'error' : typeof data.detail === 'string' ? 'detail' : 'unknown',
  });
}
async function readJson(response: Response, maxBytes = 128_000): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader)
    throw new LearningError('ChatGPT devolvió una respuesta vacía.', 502, 'chatgpt_format');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > maxBytes)
        throw new LearningError(
          'La respuesta de ChatGPT supera el límite de lectura.',
          502,
          'chatgpt_format',
        );
      chunks.push(part.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}
function finalText(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const output = (value as { output?: unknown }).output;
  if (!Array.isArray(output)) return '';
  return output
    .filter((item) => item && item.type === 'message' && item.role === 'assistant')
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .filter((item) => item?.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text)
    .join('');
}
export async function readChatGPTStream(response: Response): Promise<string> {
  if (!response.ok) {
    const body = await readJson(response).catch(() => undefined);
    throw serviceFailure(response.status, body, response.headers.get('x-request-id') || undefined);
  }
  const reader = response.body?.getReader();
  if (!reader)
    throw new LearningError('ChatGPT devolvió una respuesta vacía.', 502, 'chatgpt_format');
  const decoder = new TextDecoder();
  let buffer = '',
    dataLines: string[] = [],
    eventName = '',
    output = '',
    completed = false,
    bytes = 0;
  function event() {
    if (!dataLines.length) {
      eventName = '';
      return;
    }
    const data = dataLines.join('\n');
    dataLines = [];
    if (data === '[DONE]') {
      eventName = '';
      return;
    }
    let value: Record<string, any>;
    try {
      value = JSON.parse(data);
    } catch {
      throw new LearningError('ChatGPT envió un evento incompleto.', 502, 'chatgpt_format');
    }
    const type = value.type || eventName;
    eventName = '';
    if (type === 'response.output_text.delta' && typeof value.delta === 'string')
      output += value.delta;
    if (type === 'response.failed') {
      const code = value.response?.error?.code;
      throw serviceFailure(
        code === 'subscription_sharing_usage_limit_exceeded' ? 429 : 502,
        value.response,
        response.headers.get('x-request-id') || undefined,
      );
    }
    if (type === 'error')
      throw serviceFailure(
        502,
        { error: value },
        response.headers.get('x-request-id') || undefined,
      );
    if (type === 'response.incomplete')
      throw new LearningError(
        'La respuesta de ChatGPT quedó incompleta. No se guardó como una explicación terminada.',
        502,
        'chatgpt_incomplete',
      );
    if (type === 'response.completed') {
      if (value.response?.error)
        throw serviceFailure(
          502,
          value.response,
          response.headers.get('x-request-id') || undefined,
        );
      if (value.response?.status !== 'completed')
        throw new LearningError(
          'ChatGPT no confirmó una respuesta completa.',
          502,
          'chatgpt_incomplete',
        );
      output = finalText(value.response) || output;
      completed = true;
    }
  }
  try {
    while (!completed) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_STREAM_BYTES)
        throw new LearningError(
          'La respuesta de ChatGPT supera el límite de lectura. Formula una pregunta más concreta.',
          502,
          'chatgpt_response_limit',
        );
      buffer += decoder.decode(part.value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0 && !completed) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        if (!line) event();
        else if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (!completed)
      throw new LearningError(
        'La conexión terminó antes de que ChatGPT confirmara la respuesta. Puedes volver a intentarlo.',
        502,
        'chatgpt_interrupted',
      );
    if (!output.trim())
      throw new LearningError(
        'ChatGPT completó la consulta sin una explicación de texto.',
        502,
        'chatgpt_empty',
      );
    return output;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

export class ChatGPTService {
  private readonly auth: ChatGPTAuthPort;
  private readonly transport: typeof fetch;
  private readonly file: string;
  private preferences: Preferences = { model: '', welcomeSeen: false };
  private ready: Promise<void>;
  private writing = Promise.resolve();
  private models: ChatGPTModel[] = [];
  private catalogProfile = '';
  private catalogPromise?: Promise<void>;
  private catalogFailure?: LearningError;
  private login?: Promise<void>;
  private loginFailure?: LearningError;
  private active = 0;

  constructor(
    private readonly dataDir: string,
    options: { auth?: ChatGPTAuthPort; fetch?: typeof fetch } = {},
  ) {
    this.auth = options.auth || new ChatGPTAuth(dataDir);
    this.transport = options.fetch || fetch;
    this.file = join(dataDir, 'chatgpt-preferences.json');
    this.ready = this.loadPreferences();
  }
  private async loadPreferences() {
    try {
      const parsed = z
        .object({ model: z.string().max(200), welcomeSeen: z.boolean() })
        .parse(JSON.parse(await readFile(this.file, 'utf8')));
      this.preferences = parsed;
    } catch {
      /* New installations use explicit model discovery. */
    }
  }
  private async savePreferences(value: Partial<Preferences>) {
    await this.ready;
    const operation = this.writing.then(async () => {
      const next = { ...this.preferences, ...value };
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const temp = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify(next) + '\n', { mode: 0o600 });
      await rename(temp, this.file);
      this.preferences = next;
    });
    this.writing = operation.catch(() => undefined);
    await operation;
  }
  private async requestModels(profileId: string) {
    if (this.catalogPromise) return this.catalogPromise;
    this.catalogPromise = (async () => {
      const signal = AbortSignal.timeout(15_000);
      const models = await this.auth.withAccess(
        profileId,
        async (token, operationSignal) => {
          const response = await this.transport(API + '/models', {
            headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' },
            redirect: 'error',
            signal: operationSignal,
            cache: 'no-store',
          });
          const body = response.ok
            ? await readJson(response, 1_000_000)
            : await readJson(response).catch(() => undefined);
          if (!response.ok)
            throw serviceFailure(
              response.status,
              body,
              response.headers.get('x-request-id') || undefined,
            );
          const catalog = z.object({ models: z.array(z.unknown()).max(500) }).safeParse(body);
          if (!catalog.success)
            throw new LearningError(
              'ChatGPT devolvió un catálogo de modelos incompatible.',
              502,
              'chatgpt_models',
            );
          const visible = catalog.data.models.filter(
            (model) =>
              !!model &&
              typeof model === 'object' &&
              (model as { visibility?: unknown }).visibility === 'list',
          );
          const parsed = z
            .array(
              z.object({
                slug: z
                  .string()
                  .min(1)
                  .max(200)
                  .regex(/^[\w.:-]+$/),
                display_name: z.string().min(1).max(200),
              }),
            )
            .safeParse(visible);
          if (!parsed.success)
            throw new LearningError(
              'ChatGPT devolvió un catálogo de modelos incompatible.',
              502,
              'chatgpt_models',
            );
          return parsed.data.map((model) => ({
            slug: model.slug,
            displayName: model.display_name,
          }));
        },
        signal,
      );
      const session = await this.auth.status();
      if (session.profileId !== profileId || !session.sharing)
        throw new LearningError(
          'La cuenta cambió mientras se consultaban sus modelos. Reabre la conexión.',
          409,
          'chatgpt_profile_changed',
        );
      this.models = Array.from(new Map(models.map((model) => [model.slug, model])).values());
      this.catalogProfile = profileId;
      this.catalogFailure = undefined;
      if (!this.models.some((model) => model.slug === this.preferences.model))
        this.preferences.model = this.models[0]?.slug || '';
    })()
      .catch((error) => {
        this.models = [];
        this.catalogProfile = profileId;
        this.catalogFailure =
          error instanceof LearningError
            ? error
            : new LearningError(
                'No se pudo obtener el catálogo de ChatGPT. Revisa tu conexión y vuelve a intentarlo.',
                502,
                'chatgpt_models',
              );
      })
      .finally(() => {
        this.catalogPromise = undefined;
      });
    return this.catalogPromise;
  }
  async status(): Promise<ChatGPTStatus> {
    await this.ready;
    const session = await this.auth.status();
    if (
      !this.login &&
      session.phase !== 'connecting' &&
      session.connected &&
      session.sharing &&
      session.profileId &&
      session.profileId !== this.catalogProfile
    )
      await this.requestModels(session.profileId);
    const current = await this.auth.status();
    const sameProfile = current.profileId === this.catalogProfile;
    return {
      available: current.available,
      connected: current.connected,
      sharing: current.sharing,
      profileId: current.profileId,
      email: current.email,
      phase: current.phase,
      authUrl: current.authUrl,
      error: current.error,
      errorCode: current.errorCode,
      storage: current.storage,
      ...(sameProfile && this.catalogFailure
        ? {
            phase: 'error' as const,
            error: this.catalogFailure.message,
            errorCode: this.catalogFailure.code,
          }
        : {}),
      ...(this.loginFailure
        ? {
            phase: 'error' as const,
            error: this.loginFailure.message,
            errorCode: this.loginFailure.code,
          }
        : {}),
      ...(this.login ? { phase: 'connecting' as const } : {}),
      model: sameProfile ? this.preferences.model : '',
      models: sameProfile ? this.models : [],
      usageUrl: CHATGPT_USAGE_URL,
      welcomeSeen: this.preferences.welcomeSeen,
    };
  }
  async connect(options?: {
    profileId?: string;
    newAccount?: boolean;
    enableSharing?: boolean;
  }): Promise<ChatGPTStatus> {
    if (this.login)
      throw new LearningError('Ya hay un inicio de sesión en curso.', 409, 'chatgpt_login_busy');
    this.catalogProfile = '';
    this.catalogFailure = undefined;
    this.loginFailure = undefined;
    this.login = this.auth
      .start(options)
      .catch((error) => {
        if (error instanceof LearningError && error.code === 'cancelled') return;
        this.loginFailure =
          error instanceof LearningError
            ? error
            : new LearningError(
                'No se pudo completar el inicio de sesión con ChatGPT.',
                502,
                'chatgpt_login',
              );
      })
      .finally(() => {
        this.login = undefined;
      });
    // Auth owns the pending state and error. Polling never waits for the browser callback.
    return this.status();
  }
  async cancel(): Promise<ChatGPTStatus> {
    await this.auth.cancel();
    await this.login;
    this.loginFailure = undefined;
    return this.status();
  }
  async disconnect(): Promise<ChatGPTStatus> {
    await this.auth.disconnect();
    await this.login;
    this.loginFailure = undefined;
    this.models = [];
    this.catalogProfile = '';
    this.catalogFailure = undefined;
    return this.status();
  }
  async selectModel(model: string): Promise<ChatGPTStatus> {
    const status = await this.status();
    if (!status.sharing || !status.models.some((item) => item.slug === model))
      throw new LearningError('Elige un modelo disponible para esta cuenta.', 400, 'chatgpt_model');
    await this.savePreferences({ model });
    return this.status();
  }
  async acknowledgeWelcome(): Promise<ChatGPTStatus> {
    await this.savePreferences({ welcomeSeen: true });
    return this.status();
  }
  async refresh(): Promise<ChatGPTStatus> {
    this.catalogProfile = '';
    this.catalogFailure = undefined;
    return this.status();
  }
  async complete(
    instructions: string,
    input: string,
    options: {
      allowRemote: boolean;
      expectedProfileId?: string;
      model?: string;
      signal?: AbortSignal;
    },
  ): Promise<{ content: string; model: string }> {
    if (!options.allowRemote)
      throw new LearningError(
        'Autoriza el envío de esta pregunta y sus fragmentos a OpenAI para usar tu plan de ChatGPT.',
        403,
        'remote_consent_required',
      );
    if (!options.expectedProfileId)
      throw new LearningError(
        'Confirma la cuenta ChatGPT antes de enviar la consulta.',
        409,
        'chatgpt_profile_changed',
      );
    const status = await this.status();
    if (!status.connected || !status.sharing)
      throw new LearningError(
        'Inicia sesión y permite usar tu plan de ChatGPT antes de consultar.',
        409,
        'chatgpt_not_connected',
      );
    if (status.profileId !== options.expectedProfileId)
      throw new LearningError(
        'La cuenta ChatGPT cambió. Reabre la consulta para confirmar el envío.',
        409,
        'chatgpt_profile_changed',
      );
    if (this.catalogFailure) throw this.catalogFailure;
    const model = options.model || status.model;
    if (!status.models.some((item) => item.slug === model))
      throw new LearningError(
        'El modelo seleccionado no está disponible en esta cuenta.',
        400,
        'chatgpt_model',
      );
    if (this.active >= 2)
      throw new LearningError(
        'Ya hay dos consultas en curso. Espera a que termine una.',
        429,
        'provider_busy',
      );
    const signal = AbortSignal.any([
      AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      ...(options.signal ? [options.signal] : []),
    ]);
    this.active++;
    try {
      return await this.auth.withAccess(
        options.expectedProfileId,
        async (token, operationSignal) => {
          const response = await this.transport(API + '/responses', {
            method: 'POST',
            headers: {
              Authorization: 'Bearer ' + token,
              Accept: 'text/event-stream',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              instructions,
              input: [{ role: 'user', content: input }],
              store: false,
              stream: true,
            }),
            signal: operationSignal,
            redirect: 'error',
            cache: 'no-store',
          });
          return { content: await readChatGPTStream(response), model };
        },
        signal,
      );
    } catch (error) {
      if (error instanceof LearningError) throw error;
      if (options.signal?.aborted) throw new LearningError('Consulta cancelada.', 499, 'cancelled');
      if (signal.aborted)
        throw new LearningError(
          'La consulta a ChatGPT superó 90 segundos. Prueba una pregunta más concreta.',
          504,
          'chatgpt_timeout',
        );
      throw new LearningError(
        'No se pudo completar la conexión con ChatGPT. No se cambió a otra forma de pago.',
        502,
        'chatgpt_connection',
      );
    } finally {
      this.active--;
    }
  }
}
