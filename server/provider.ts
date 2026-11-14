import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { ProviderConfig, ProviderInput } from '../shared/learning.js';

const DEFAULT_ENDPOINT = 'http://127.0.0.1:11434/v1';
const MAX_RESPONSE_BYTES = 1_000_000;
const inputSchema = z
  .object({
    endpoint: z.string().trim().min(1).max(2048),
    model: z
      .string()
      .trim()
      .max(200)
      .refine(
        (value) => !/[\r\n\x00-\x1f]/.test(value),
        'El nombre del modelo contiene caracteres inválidos.',
      ),
    apiKey: z.string().max(4096).optional(),
    allowRemote: z.boolean().optional(),
  })
  .strict();

export class LearningError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
    public readonly code = 'learning_error',
  ) {
    super(message);
  }
}

export function validateEndpoint(value: string): { endpoint: string; isLocal: boolean } {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new LearningError('Introduce una dirección válida para la API compatible con OpenAI.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new LearningError(
      'La dirección de la API debe contener únicamente protocolo, host, puerto y ruta.',
    );
  }
  const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new LearningError(
      'Usa HTTPS para un proveedor remoto o HTTP en localhost para un modelo local.',
    );
  }
  return { endpoint: url.href.replace(/\/+$/, ''), isLocal };
}

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ModelProvider {
  private endpoint = DEFAULT_ENDPOINT;
  private model = '';
  private key = '';
  private readonly path: string;
  private readonly ready: Promise<void>;
  private writing = Promise.resolve();
  private active = 0;

  constructor(private readonly dataDir: string) {
    this.path = join(dataDir, 'provider.json');
    this.ready = this.load();
  }

  private async load(): Promise<void> {
    try {
      const text = await readFile(this.path, 'utf8');
      const saved: unknown = JSON.parse(text);
      const parsed = inputSchema.pick({ endpoint: true, model: true }).safeParse(saved);
      if (parsed.success) {
        this.endpoint = validateEndpoint(parsed.data.endpoint).endpoint;
        this.model = parsed.data.model;
      }
    } catch {
      // Missing or invalid preferences leave a usable local default.
    }
    if (process.env.TRAMA_MODEL_ENDPOINT) {
      this.endpoint = validateEndpoint(process.env.TRAMA_MODEL_ENDPOINT).endpoint;
    }
    if (process.env.TRAMA_MODEL)
      this.model = inputSchema.shape.model.parse(process.env.TRAMA_MODEL);
    if (process.env.TRAMA_MODEL_API_KEY) this.key = validateKey(process.env.TRAMA_MODEL_API_KEY);
  }

  async config(): Promise<ProviderConfig> {
    await this.ready;
    return {
      endpoint: this.endpoint,
      model: this.model,
      configured: this.model.length > 0,
      hasKey: this.key.length > 0,
      isLocal: validateEndpoint(this.endpoint).isLocal,
    };
  }

  async configure(input: ProviderInput): Promise<ProviderConfig> {
    await this.ready;
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success)
      throw new LearningError('Revisa la dirección, el modelo y la credencial del proveedor.');
    const { endpoint } = validateEndpoint(parsed.data.endpoint);
    const nextKey =
      parsed.data.apiKey === undefined
        ? endpoint === this.endpoint
          ? this.key
          : ''
        : validateKey(parsed.data.apiKey);
    const model = parsed.data.model;
    const persist = async () => {
      await mkdir(this.dataDir, { recursive: true, mode: 0o700 });
      const temp = this.path + '.' + randomUUID() + '.tmp';
      await writeFile(temp, JSON.stringify({ endpoint, model }, null, 2) + '\n', { mode: 0o600 });
      await rename(temp, this.path);
      this.endpoint = endpoint;
      this.model = model;
      this.key = nextKey;
    };
    const write = this.writing.then(persist);
    this.writing = write.catch(() => undefined);
    try {
      await write;
    } catch {
      throw new LearningError('No se pudo guardar la configuración del proveedor.', 500);
    }
    return this.config();
  }

  async complete(
    messages: Message[],
    options: {
      allowRemote: boolean;
      expectedEndpoint?: string;
      signal?: AbortSignal;
      maxTokens?: number;
    },
  ): Promise<{ content: string; model: string }> {
    await this.ready;
    const endpoint = this.endpoint;
    const model = this.model;
    const key = this.key;
    if (!model)
      throw new LearningError(
        'Elige un modelo en Ajustes para usar el tutor.',
        409,
        'provider_unconfigured',
      );
    const isLocal = validateEndpoint(endpoint).isLocal;
    if (!isLocal && !options.allowRemote) {
      throw new LearningError(
        'Autoriza el envío del contexto seleccionado a este proveedor para esta consulta.',
        403,
        'remote_consent_required',
      );
    }
    if (
      (!isLocal && !options.expectedEndpoint) ||
      (options.expectedEndpoint !== undefined &&
        validateEndpoint(options.expectedEndpoint).endpoint !== endpoint)
    ) {
      throw new LearningError(
        'La conexión cambió o falta confirmar su destino. Vuelve a abrir la configuración o la consulta para revisar el proveedor antes de enviar.',
        409,
        'provider_changed',
      );
    }
    if (this.active >= 2)
      throw new LearningError(
        'Ya hay dos consultas en curso. Espera a que termine una.',
        429,
        'provider_busy',
      );
    this.active++;
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      };
      if (key) headers.Authorization = 'Bearer ' + key;
      const timeout = AbortSignal.timeout(90_000);
      const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
      const response = await fetch(endpoint + '/chat/completions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          max_tokens: options.maxTokens ?? 2200,
        }),
        signal,
        redirect: 'error',
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 401 || response.status === 403)
          throw new LearningError(
            'El proveedor rechazó el acceso. Revisa la credencial y los permisos del modelo.',
            502,
            'provider_auth',
          );
        if (response.status === 429)
          throw new LearningError(
            'El proveedor alcanzó su límite de uso. Espera antes de volver a consultar.',
            429,
            'provider_limit',
          );
        if (response.status === 404)
          throw new LearningError(
            'El proveedor no encontró ese modelo o esa ruta de API. Comprueba la dirección y el nombre del modelo.',
            502,
            'provider_not_found',
          );
        throw new LearningError(
          'El proveedor no pudo completar la consulta.',
          502,
          'provider_error',
        );
      }
      const data = await boundedJson(response);
      const parsed = z
        .object({
          choices: z
            .array(z.object({ message: z.object({ content: z.string().max(120_000) }) }))
            .min(1),
        })
        .safeParse(data);
      if (!parsed.success)
        throw new LearningError(
          'El proveedor devolvió una respuesta incompatible con chat/completions.',
          502,
          'provider_format',
        );
      return { content: parsed.data.choices[0].message.content, model };
    } catch (error) {
      if (error instanceof LearningError) throw error;
      if (options.signal?.aborted) throw new LearningError('Consulta cancelada.', 499, 'cancelled');
      if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
        throw new LearningError(
          'El modelo tardó más de 90 segundos. Prueba un contexto más pequeño o un modelo más rápido.',
          504,
          'provider_timeout',
        );
      }
      throw new LearningError(
        'No se pudo conectar con el proveedor. Comprueba que esté iniciado y que la dirección sea correcta.',
        502,
        'provider_connection',
      );
    } finally {
      this.active--;
    }
  }

  async test(
    allowRemote: boolean,
    expectedEndpoint?: string,
  ): Promise<{ ok: true; model: string }> {
    const result = await this.complete(
      [{ role: 'user', content: 'Reply with the single word OK.' }],
      { allowRemote, expectedEndpoint, maxTokens: 16 },
    );
    if (!result.content.trim())
      throw new LearningError('El proveedor respondió sin contenido.', 502);
    return { ok: true, model: result.model };
  }
}

function validateKey(key: string): string {
  if (/[\r\n\x00-\x1f]/.test(key))
    throw new LearningError('La credencial contiene caracteres inválidos.');
  return key.trim();
}

async function boundedJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new LearningError('El proveedor devolvió una respuesta vacía.', 502);
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  while (true) {
    const item = await reader.read();
    if (item.done) break;
    bytes += item.value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new LearningError('La respuesta del proveedor supera el tamaño permitido.', 502);
    }
    chunks.push(item.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new LearningError(
      'El proveedor devolvió una respuesta JSON inválida.',
      502,
      'provider_format',
    );
  }
}
