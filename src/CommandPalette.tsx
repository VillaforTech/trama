import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowUpRight, FileCode2, Search } from 'lucide-react';
import type { Anchor, Snapshot } from '../shared/types';

export interface Command {
  id: string;
  title: string;
  detail?: string;
  icon?: ReactNode;
  run: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
  snapshot?: Pick<Snapshot, 'files'> | null;
  onOpenSource?: (anchor: Anchor) => void;
}

interface Result extends Command {
  kind: 'command' | 'file';
  score: number;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function CommandPalette({
  commands,
  onClose,
  snapshot,
  onOpenSource,
}: CommandPaletteProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const titleId = useId();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const matches = useMemo(() => {
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const results: Result[] = commands
      .filter((command) => {
        const searchable = normalize(command.title + ' ' + (command.detail || ''));
        return terms.every((term) => searchable.includes(term));
      })
      .map((command) => ({
        ...command,
        kind: 'command',
        score: normalize(command.title).startsWith(normalize(query).trim()) ? 12 : 5,
      }));
    if (terms.length && snapshot && onOpenSource) {
      for (const file of snapshot.files) {
        const path = normalize(file.path);
        if (!terms.every((term) => path.includes(term))) continue;
        const basename = file.path.split('/').at(-1) || file.path;
        results.push({
          id: 'file:' + file.path,
          title: basename,
          detail: file.path,
          icon: <FileCode2 size={16} />,
          kind: 'file',
          score: normalize(basename) === normalize(query).trim() ? 20 : 8,
          run: () => onOpenSource({ path: file.path, line: 1, end: 1, excerpt: '' }),
        });
      }
    }
    return results.sort((a, b) => b.score - a.score);
  }, [commands, query, snapshot, onOpenSource]);
  const visible = matches.slice(0, 8);
  const active = Math.min(selected, Math.max(0, visible.length - 1));

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    input.current?.focus();
    return () => element?.close();
  }, []);

  useEffect(() => {
    dialog.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, query]);

  function run(result: Result) {
    onClose();
    result.run();
  }

  return (
    <dialog
      ref={dialog}
      className="command-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target !== dialog.current) return;
        const bounds = dialog.current.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          onClose();
        }
      }}
    >
      <div className="command-search">
        <Search size={19} aria-hidden="true" />
        <label htmlFor={titleId + '-input'} id={titleId} className="sr-only">
          Buscar acciones y archivos
        </label>
        <input
          ref={input}
          id={titleId + '-input'}
          className="command-input"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={visible.length ? listId + '-option-' + active : undefined}
          placeholder={snapshot ? 'Una acción o un archivo…' : '¿Qué quieres hacer?'}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault();
              if (visible.length) {
                setSelected((active + (event.key === 'ArrowDown' ? 1 : -1) + visible.length) % visible.length);
              }
            }
            if (event.key === 'Enter' && visible[active]) {
              event.preventDefault();
              run(visible[active]);
            }
          }}
        />
        <button type="button" className="keyhint" aria-label="Cerrar búsqueda" onClick={onClose}>
          esc
        </button>
      </div>
      <div id={listId} className="command-list" role="listbox" aria-label="Resultados de búsqueda">
        {visible.map((result, index) => (
          <button
            type="button"
            role="option"
            tabIndex={-1}
            id={listId + '-option-' + index}
            key={result.id}
            aria-selected={index === active}
            className={index === active ? 'active' : ''}
            onMouseDown={(event) => event.preventDefault()}
            onMouseEnter={() => setSelected(index)}
            onClick={() => run(result)}
          >
            <span className="command-icon" aria-hidden="true">{result.icon}</span>
            <span className="command-description">
              <strong>{result.title}</strong>
              {result.detail && <small>{result.detail}</small>}
            </span>
            <span className="command-kind">{result.kind === 'file' ? 'Archivo' : 'Acción'}</span>
            <ArrowUpRight size={13} aria-hidden="true" />
          </button>
        ))}
      </div>
      {!visible.length && <p className="command-empty">No hay coincidencias. Prueba otra acción o parte de una ruta.</p>}
      <footer className="command-footer">
        <span role="status">{matches.length > 8 ? '8 de ' + matches.length : visible.length} resultados</span>
        <span><kbd className="keyhint">↑↓</kbd> elegir <kbd className="keyhint">↵</kbd> abrir</span>
      </footer>
    </dialog>
  );
}

export default CommandPalette;
