import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Check, Loader2, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import type { ChatGPTStatus } from '../shared/learning';
import { DEMO, request } from './api';
import { Button, Install, Modal } from './components';

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
      <>
        <div className="chatgpt-intro">
          <span className="connection-eyebrow">TU CUENTA, TU PLAN</span>
          <h3>Usa tu plan de ChatGPT</h3>
          <p>
            La aplicación de Mac permite conectar una cuenta elegible de ChatGPT. Esta vista pública
            conserva sólo ejemplos y no inicia sesión en tu cuenta.
          </p>
        </div>
        <Install />
      </>
    );
  return (
    <section className="chatgpt-settings" aria-label="Conexión con ChatGPT">
      <div className="chatgpt-intro">
        <span className="connection-eyebrow">TU CUENTA, TU PLAN</span>
        <h3>Usa tu plan de ChatGPT</h3>
        <p>
          Conecta una cuenta elegible de Plus o Pro. Las consultas usan el uso incluido en tu plan o
          tus créditos disponibles, sin configurar una clave de API.
        </p>
      </div>
      {status && !status.available && (
        <p className="hint">
          Conecta ChatGPT desde la aplicación de Mac. En el navegador puedes configurar una API o un
          modelo local.
        </p>
      )}
      {status?.connected ? (
        <div className="connected-account">
          <div className="account-heading">
            <span className="account-avatar" aria-hidden="true">
              {status.email?.[0]?.toUpperCase() || 'C'}
            </span>
            <div>
              <strong>{status.email || 'Cuenta de ChatGPT conectada'}</strong>
              <span>
                {status.sharing ? 'Usando tu plan de ChatGPT' : 'Falta autorizar el uso del plan'}
              </span>
            </div>
            <ShieldCheck size={19} />
          </div>
          {status.sharing && (
            <label className="field">
              Modelo disponible para esta cuenta
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
          <div className="form-actions">
            <Button
              onClick={() =>
                void openChatGPTPage(CHATGPT_USAGE_URL).catch((e) => setError(e.message))
              }
            >
              Gestionar uso <ArrowUpRight size={14} />
            </Button>
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void action('/chatgpt/disconnect')}
            >
              <LogOut size={14} />
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
            <Button disabled={busy} onClick={() => void connect()}>
              Autorizar el uso del plan <ArrowUpRight size={14} />
            </Button>
          )}
        </div>
      ) : (
        status?.phase !== 'connecting' && (
          <button
            className="chatgpt-signin"
            onClick={() => void connect()}
            disabled={busy || !status?.available}
          >
            {busy ? <Loader2 size={16} className="spin" /> : null}Continue with ChatGPT{' '}
            <ArrowUpRight size={15} />
          </button>
        )
      )}
      {status?.phase === 'connecting' && (
        <div className="connection-pending" role="status">
          <Loader2 size={17} className="spin" />
          <div>
            <strong>Completa el acceso en tu navegador</strong>
            <p>La contraseña y la autorización se gestionan en OpenAI.</p>
            <div className="form-actions">
              {status.authUrl && (
                <button
                  className="text-button"
                  onClick={() =>
                    void openChatGPTPage(status.authUrl!).catch((e) => setError(e.message))
                  }
                >
                  Abrir de nuevo <ArrowUpRight size={13} />
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
        <div className="connection-error">
          <p className="error" role="alert">
            {error || status?.error}
          </p>
          {status?.errorCode?.includes('usage') && (
            <Button
              onClick={() =>
                void openChatGPTPage(CHATGPT_USAGE_URL).catch((e) => setError(e.message))
              }
            >
              Gestionar uso <ArrowUpRight size={14} />
            </Button>
          )}
          <button className="text-button" onClick={() => void refresh(true)}>
            <RefreshCw size={13} />
            Actualizar estado
          </button>
        </div>
      )}
      <p className="footnote">
        Trama no recibe tu contraseña ni acceso a tus conversaciones de ChatGPT. Cada consulta envía
        a OpenAI la pregunta y los fragmentos de código que necesita. Los límites dependen de tu
        cuenta y de la autorización de la aplicación.
      </p>
      <p className="footnote">
        Sin cambios automáticos a facturación por API. Puedes retirar el acceso desde la
        configuración de ChatGPT.
      </p>
      {welcome && (
        <Modal title="Estás usando tu plan de ChatGPT" onClose={() => void acknowledge()}>
          <p>
            Las consultas elegibles de Trama usarán el uso incluido en tu plan de ChatGPT o tus
            créditos disponibles. Puedes revisar y gestionar el consumo en cualquier momento.
          </p>
          <div className="form-actions">
            <Button primary onClick={() => void acknowledge()}>
              <Check size={15} />
              Entendido
            </Button>
            <button className="text-button" onClick={() => void openChatGPTPage(CHATGPT_USAGE_URL)}>
              Gestionar uso <ArrowUpRight size={14} />
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
