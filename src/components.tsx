import { useCallback, useEffect, useRef, useState, useId, type ReactNode } from 'react';
import {
  ArrowUpRight,
  X,
  FileCode2,
  CheckCircle2,
  HelpCircle,
  GitBranch,
  ExternalLink,
  ChevronRight,
} from 'lucide-react';
import type { Anchor, Snapshot, SourceFile } from '../shared/types';
import { api, DEMO } from './api';
import './inspector.css';

export const REPO = 'https://github.com/VillaforTech/trama';
export const stateLabel = {
  source: 'En el código',
  inferred: 'Interpretación',
  unknown: 'Por comprobar',
};
export function Logo() {
  return (
    <span className="logo">
      <svg
        className="brand-mark"
        aria-hidden="true"
        width="28"
        height="30"
        viewBox="0 0 32 36"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      >
        <path d="m4 10 12-7 12 7-12 7Z" />
        <path d="m4 18 12 7 12-7" opacity=".5" />
        <path d="m4 26 12-7 12 7-12 7Z" />
        <path d="M16 17v8" />
      </svg>
      trama<span className="version">0.1</span>
    </span>
  );
}
export function Button({
  children,
  onClick,
  primary = false,
  disabled = false,
  className = '',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  primary?: boolean;
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      className={'button ' + (primary ? 'primary ' : '') + className}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
export function Pill({ status }: { status: keyof typeof stateLabel }) {
  return (
    <span className={'pill ' + status}>
      {status === 'source' ? (
        <CheckCircle2 size={12} />
      ) : status === 'inferred' ? (
        <GitBranch size={12} />
      ) : (
        <HelpCircle size={12} />
      )}{' '}
      {stateLabel[status]}
    </span>
  );
}
export function Citation({
  anchor,
  onClick,
  label,
}: {
  anchor: Anchor;
  onClick: (a: Anchor) => void;
  label?: string;
}) {
  return (
    <button className="citation" onClick={() => onClick(anchor)}>
      <FileCode2 size={13} />
      {label || anchor.path}
      <span>L{anchor.line}</span>
      <ArrowUpRight size={12} />
    </button>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={'modal ' + (wide ? 'wide' : '')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button aria-label="Cerrar" className="icon-button" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="modal-content">{children}</div>
    </dialog>
  );
}
export function SourcePanel({
  snapshot,
  anchor,
  onClose,
}: {
  snapshot: Snapshot;
  anchor: Anchor;
  onClose: () => void;
}) {
  const [file, setFile] = useState<SourceFile | null>(null),
    [error, setError] = useState('');
  const [isInspector, setIsInspector] = useState(
    () => window.matchMedia('(min-width: 1200px)').matches,
  );
  const inspectorRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const codeRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const closeSource = useCallback(() => {
    const trigger = triggerRef.current;
    onCloseRef.current();
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1200px)');
    const update = () => setIsInspector(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    // A second citation can update an open inspector without pulling focus away
    // from the reading. Closing returns to that most recent outside trigger.
    const active = document.activeElement;
    if (
      isInspector &&
      active instanceof HTMLElement &&
      active !== document.body &&
      active.isConnected &&
      !inspectorRef.current?.contains(active)
    ) {
      triggerRef.current = active;
    }
  }, [anchor, isInspector]);
  useEffect(() => {
    if (!isInspector) return;
    closeButtonRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        !document.querySelector('dialog[open]')
      ) {
        event.preventDefault();
        closeSource();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isInspector, closeSource]);
  useEffect(() => {
    let alive = true;
    setFile(null);
    setError('');
    api
      .file(snapshot.id, anchor.path)
      .then((f) => {
        if (alive) setFile(f);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [snapshot.id, anchor.path]);
  useEffect(() => {
    const container = codeRef.current;
    const selected = container?.querySelector<HTMLElement>('.code-line.selected');
    if (!container || !selected) return;
    const position =
      selected.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      container.clientTop;
    container.scrollTop = Math.max(
      0,
      position - (container.clientHeight - selected.offsetHeight) / 2,
    );
  }, [file, anchor.line, isInspector]);
  const external =
    anchor.url && /^https:\/\/github\.com\//.test(anchor.url) ? anchor.url : undefined;
  const content = (
    <>
      <div className="source-head">
        <div>
          <strong>{anchor.path}</strong>
          <small>
            Captura {snapshot.revision.slice(0, 12)} · líneas {anchor.line}–{anchor.end}
          </small>
        </div>
        {external && (
          <a href={external} target="_blank" rel="noreferrer">
            GitHub <ExternalLink size={13} />
          </a>
        )}
      </div>
      {error ? (
        <p role="alert" className="error">
          {error}
        </p>
      ) : !file ? (
        <p className="muted">Abriendo el archivo…</p>
      ) : (
        <div className="code-window" tabIndex={0} ref={codeRef}>
          {file.text.split(/\r\n|\r|\n/).map((text, i) => (
            <div
              key={i}
              className={
                'code-line ' + (i + 1 >= anchor.line && i + 1 <= anchor.end ? 'selected' : '')
              }
            >
              <span aria-hidden="true">{i + 1}</span>
              <code>{text || ' '}</code>
            </div>
          ))}
        </div>
      )}
      <p className="footnote">
        El fragmento pertenece a esta captura. Las decisiones que dependen del entorno se comprueban
        con su configuración o una ejecución.
      </p>
    </>
  );
  return isInspector ? (
    <aside
      className="source-inspector"
      role="complementary"
      aria-label="Código de referencia"
      ref={inspectorRef}
    >
      <header className="source-inspector-heading">
        <h2>Leer la fuente</h2>
        <button
          aria-label="Cerrar"
          className="icon-button"
          onClick={closeSource}
          ref={closeButtonRef}
        >
          <X size={18} />
        </button>
      </header>
      <div className="source-inspector-content">{content}</div>
    </aside>
  ) : (
    <Modal title="Leer la fuente" onClose={closeSource} wide>
      {content}
    </Modal>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Install() {
  return (
    <div className="install">
      <p>
        Abre tus repositorios privados en Trama para Mac. Tus fuentes y cuadernos se guardan en tu
        equipo; el modelo de IA es opcional.
      </p>
      <a
        className="button primary"
        href={REPO + '/blob/main/README.es.md#instalar-en-mac'}
        target="_blank"
        rel="noreferrer"
      >
        Instalar Trama para Mac <ArrowUpRight size={15} />
      </a>
      <p className="footnote">
        Apple Silicon · macOS 13 o posterior. El código y la guía de instalación están disponibles;
        la publicación de los instaladores está pendiente. Esta versión aún no tiene firma Developer
        ID ni notarización de Apple.
      </p>
      <a
        className="text-button"
        href={REPO + '/blob/main/README.es.md'}
        target="_blank"
        rel="noreferrer"
      >
        Ver la guía de instalación <ChevronRight size={14} />
      </a>
      <details className="install-source">
        <summary>Ejecutar desde el código fuente</summary>
        <pre>
          <code>
            {
              'git clone https://github.com/VillaforTech/trama.git\ncd trama\nnpm ci\nnpm run desktop'
            }
          </code>
        </pre>
        <p className="footnote">Requiere Node.js 24 o posterior para desarrollo.</p>
      </details>
    </div>
  );
}
export function Mode() {
  return (
    <span className="mode">
      <span />
      {DEMO ? 'Demo pública · ejemplos incluidos' : 'En tu equipo · datos locales'}
    </span>
  );
}
