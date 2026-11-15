import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ChatGPTStatus } from '../shared/learning';
import { DEMO, request } from './api';
import { Button, Install, Modal } from './components';
import './settings.css';

export const CHATGPT_USAGE_URL = 'https://chatgpt.com/settings/usage';
export async function openChatGPTPage(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['auth.openai.com', 'chatgpt.com'].includes(parsed.hostname))
    throw new Error('La dirección no pertenece al acceso oficial de ChatGPT.');
  if (window.tramaDesktop) await window.tramaDesktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}

export default function ChatGPTSettings({ onNotice }: { onNotice: (message: string) => void }) {
  const [status, setStatus] = useState<ChatGPTStatus | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [welcome, setWelcome] = useState(false);
  const mounted = useRef(false);
  const openedAuthorization = useRef('');
  const apply = useCallback((next: ChatGPTStatus) => {
    if (!mounted.current) return;
    setStatus(next);
    if (next.sharing && !next.welcomeSeen) setWelcome(true);
  }, []);
  const refresh = useCallback(
    async (retry = false) => {
      try {
        apply(
          await request<ChatGPTStatus>(
            retry ? '/chatgpt/refresh' : '/chatgpt/status',
            retry ? {} : undefined,
          ),
        );
      } catch (e) {
        if (mounted.current) setError((e as Error).message);
      }
    },
    [apply],
  );
  useEffect(() => {
    mounted.current = true;
    if (!DEMO) void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);
  useEffect(() => {
    if (status?.phase !== 'connecting') return;
    const timer = setInterval(() => void refresh(), 1500);
    return () => clearInterval(timer);
  }, [status?.phase, refresh]);
  useEffect(() => {
    if (
      status?.phase !== 'connecting' ||
      !status.authUrl ||
      status.authUrl === openedAuthorization.current
    )
      return;
    openedAuthorization.current = status.authUrl;
    void openChatGPTPage(status.authUrl).catch((e) => {
      if (mounted.current) setError(e.message);
    });
  }, [status?.phase, status?.authUrl]);
  async function connect(newAccount = false) {
    setBusy(true);
    setError('');
    try {
      const next = await request<ChatGPTStatus>('/chatgpt/connect', {
        newAccount,
        enableSharing: !!status?.connected && !status.sharing,
      });
      apply(next);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function action(path: string) {
    setBusy(true);
    setError('');
    try {
      apply(await request<ChatGPTStatus>(path, {}));
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function acknowledge() {
    try {
      apply(await request<ChatGPTStatus>('/chatgpt/welcome', {}));
      setWelcome(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (DEMO)
    return (
      <section className="chatgpt-preferences" aria-label="Conexión con ChatGPT">
        <header className="preferences-heading">
          <h3>ChatGPT</h3>
          <p>
            Conecta tu cuenta desde la aplicación de Mac. Esta vista pública sólo contiene ejemplos
            y no inicia sesión en tu cuenta.
          </p>
        </header>
        <Install />
      </section>
    );
  return (
    <section className="chatgpt-settings chatgpt-preferences" aria-label="Conexión con ChatGPT">
      <header className="preferences-heading">
        <h3>ChatGPT</h3>
        <p>Usa una cuenta elegible de Plus o Pro para consultar el código, sin una clave de API.</p>
      </header>
      {status && !status.available && (
        <p className="preferences-availability">
          Conecta ChatGPT desde la aplicación de Mac. En el navegador puedes configurar una API o un
          modelo local.
        </p>
      )}
      {status?.connected ? (
        <div className="preferences-account">
          <div className="preferences-identity">
            <strong>{status.email || 'Cuenta de ChatGPT conectada'}</strong>
            <span className={status.sharing ? 'preferences-connected' : ''}>
              {status.sharing ? 'Usando tu plan de ChatGPT' : 'Falta autorizar el uso del plan'}
            </span>
          </div>
          {status.sharing && (
            <label className="preferences-model">
              <span>Modelo disponible para esta cuenta</span>
              <select
                value={status.model}
                disabled={busy || status.phase === 'connecting' || !status.models.length}
                onChange={async (e) => {
                  setBusy(true);
                  setError('');
                  try {
                    apply(
                      await request<ChatGPTStatus>(
                        '/chatgpt/model',
                        { model: e.target.value },
                        'PUT',
                      ),
                    );
                    onNotice('Modelo de ChatGPT guardado.');
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {!status.models.length && <option value="">Sin modelos disponibles</option>}
                {status.models.map((model) => (
                  <option key={model.slug} value={model.slug}>
                    {model.displayName || model.slug}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="preferences-account-actions">
            <button
              className="text-button"
              onClick={() =>
                void openChatGPTPage(CHATGPT_USAGE_URL).catch((e) => setError(e.message))
              }
            >
              Gestionar uso
            </button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void action('/chatgpt/disconnect')}
            >
              Desconectar de Trama
            </button>
            <button
              className="text-button"
              disabled={busy || status.phase === 'connecting'}
              onClick={() => void connect(true)}
            >
              Cambiar de cuenta
            </button>
          </div>
          {!status.sharing && (
            <Button primary disabled={busy} onClick={() => void connect()}>
              Autorizar el uso del plan
            </Button>
          )}
        </div>
      ) : (
        status?.phase !== 'connecting' && (
          <button
            className="chatgpt-signin preferences-signin"
            onClick={() => void connect()}
            disabled={busy || !status?.available}
          >
            {busy ? <Loader2 size={16} className="spin" /> : null}Continue with ChatGPT
          </button>
        )
      )}
      {status?.phase === 'connecting' && (
        <div className="preferences-pending" role="status">
          <Loader2 size={15} className="spin" />
          <div>
            <strong>Completa el acceso en tu navegador</strong>
            <p>La contraseña y la autorización se gestionan en OpenAI.</p>
            <div className="preferences-inline-actions">
              {status.authUrl && (
                <button
                  className="text-button"
                  onClick={() =>
                    void openChatGPTPage(status.authUrl!).catch((e) => setError(e.message))
                  }
                >
                  Abrir de nuevo
                </button>
              )}
              <button className="text-button" onClick={() => void action('/chatgpt/cancel')}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {(error || status?.error) && (
        <div className="preferences-error">
          <p className="error" role="alert">
            {error || status?.error}
          </p>
          <div className="preferences-inline-actions">
            {status?.errorCode?.includes('usage') && (
              <button
                className="text-button"
                onClick={() =>
                  void openChatGPTPage(CHATGPT_USAGE_URL).catch((e) => setError(e.message))
                }
              >
                Gestionar uso
              </button>
            )}
            <button className="text-button" onClick={() => void refresh(true)}>
              Actualizar estado
            </button>
          </div>
        </div>
      )}
      <dl className="preferences-details">
        <div>
          <dt>Cuenta</dt>
          <dd>
            Trama no recibe tu contraseña ni acceso a tus conversaciones. Puedes retirar el acceso
            desde la configuración de ChatGPT.
          </dd>
        </div>
        <div>
          <dt>Uso</dt>
          <dd>
            Las consultas consumen la cuota incluida en tu plan o tus créditos disponibles, según
            los límites de tu cuenta. Sin cambios automáticos a facturación por API.
          </dd>
        </div>
        <div>
          <dt>Código</dt>
          <dd>Cada consulta envía a OpenAI la pregunta y los fragmentos de código que necesita.</dd>
        </div>
      </dl>
      {welcome && (
        <Modal title="Estás usando tu plan de ChatGPT" onClose={() => void acknowledge()}>
          <p>
            Las consultas elegibles de Trama usarán el uso incluido en tu plan de ChatGPT o tus
            créditos disponibles. Puedes revisar y gestionar el consumo en cualquier momento.
          </p>
          <div className="form-actions preferences-welcome-actions">
            <Button primary onClick={() => void acknowledge()}>
              Entendido
            </Button>
            <button className="text-button" onClick={() => void openChatGPTPage(CHATGPT_USAGE_URL)}>
              Gestionar uso
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
