import { useId, useState } from 'react';
import type { ProjectSummary } from '../shared/types';
import './library.css';

export interface LibraryHomeProps {
  projects: ProjectSummary[];
  onOpen: (snapshotId: string) => void;
  onOpenFolder: () => void;
  onGitHub: () => void;
  onRestore: () => void;
  onExample: (id: string) => void;
  demo: boolean;
}

const examples = [
  {
    id: 'pedidos',
    name: 'Pedidos',
    description: 'JavaScript · API y eventos',
    question: '¿Cómo se convierte una solicitud en un pedido de 750 centavos?',
    context:
      'Sigue tres unidades desde la solicitud hasta el inventario. Después, razona qué ocurre si el mismo evento llega dos veces.',
    stages: [
      {
        title: 'Validar y calcular',
        path: 'src/crear-pedido.js',
        description: 'Comprueba las unidades y calcula el importe: 3 × 250.',
      },
      {
        title: 'Guardar el pedido y su evento',
        path: 'src/storage.js',
        description: 'Escribe ambos en una transacción; un fallo revierte los cambios.',
      },
      {
        title: 'Procesar el evento después',
        path: 'src/worker.js',
        description: 'Actualiza el inventario sin repetir el movimiento del mismo evento.',
      },
    ],
    action: 'Probar con un ejemplo',
  },
  {
    id: 'data-pipeline',
    name: 'Data pipeline',
    description: 'Python · Datos e informes',
    question: '¿De dónde salen los 4.190 centavos del informe?',
    context:
      'Rastrea el total hasta las filas del CSV. Después, predice qué cambia al subir el mínimo de 500 a 1.000 centavos.',
    stages: [
      {
        title: 'Leer y validar las filas',
        path: 'reader.py',
        description: 'Convierte el CSV en pedidos y comprueba los datos de entrada.',
      },
      {
        title: 'Aplicar las reglas',
        path: 'rules.py',
        description: 'Calcula el importe neto y decide qué pedidos superan el filtro.',
      },
      {
        title: 'Agregar por región',
        path: 'aggregate.py',
        description: 'Suma los pedidos incluidos para construir el resultado del informe.',
      },
    ],
    action: 'Abrir ejemplo de datos',
  },
] as const;

const sourceLabels: Record<ProjectSummary['source'], string> = {
  local: 'Carpeta local',
  github: 'GitHub',
  example: 'Ejemplo',
};
const dateFormatter = new Intl.DateTimeFormat('es', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});
const countFormatter = new Intl.NumberFormat('es');

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Fecha no disponible' : dateFormatter.format(date);
}

export default function LibraryHome({
  projects,
  onOpen,
  onOpenFolder,
  onGitHub,
  onRestore,
  onExample,
  demo,
}: LibraryHomeProps) {
  const [selectedId, setSelectedId] = useState<string>('pedidos');
  const detailId = useId();
  const selected = examples.find((example) => example.id === selectedId) ?? examples[0];

  return (
    <div className="library-home">
      <header className="library-top">
        <div>
          <h1>Tu biblioteca</h1>
          <p>Vuelve a un proyecto o empieza con un ejemplo.</p>
        </div>
        <div className="library-top-actions">
          <button type="button" className="library-secondary" onClick={onGitHub}>
            Conectar GitHub
          </button>
          <button type="button" className="library-primary" onClick={onOpenFolder}>
            {demo ? 'Descargar para Mac' : 'Abrir carpeta'}
          </button>
        </div>
      </header>

      <section className="library-projects" aria-labelledby="library-projects-heading">
        <div className="library-section-heading">
          <h2 id="library-projects-heading">Proyectos recientes</h2>
          <button type="button" className="library-secondary" onClick={onRestore}>
            Restaurar cuaderno
          </button>
        </div>
        <div className="library-documents">
          <div className="library-document-columns" aria-hidden="true">
            <span>Nombre</span>
            <span>Origen</span>
            <span>Archivos</span>
            <span>Última actualización</span>
          </div>
          {projects.length ? (
            <ul className="library-document-list" aria-label="Proyectos recientes">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="library-document"
                    onClick={() => onOpen(project.latestSnapshotId)}
                  >
                    <span className="library-document-name" title={project.name}>
                      {project.name}
                    </span>
                    <span className="library-document-source">{sourceLabels[project.source]}</span>
                    <span className="library-document-count">
                      {countFormatter.format(project.fileCount)}
                      <span className="library-mobile-label"> archivos</span>
                    </span>
                    <time className="library-document-date" dateTime={project.updatedAt}>
                      {formatDate(project.updatedAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="library-no-projects">
              <p>Todavía no has abierto un proyecto.</p>
              <span>
                {demo
                  ? 'Los ejemplos que abras aparecerán aquí.'
                  : 'Abre una carpeta o conecta GitHub para empezar tu recorrido.'}
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="library-examples" aria-labelledby="library-examples-heading">
        <div className="library-section-heading">
          <h2 id="library-examples-heading">Explora un ejemplo</h2>
          <span>Incluidos en Trama</span>
        </div>
        <div className="library-example-browser">
          <div className="library-example-master">
            <ul aria-label="Ejemplos disponibles">
              {examples.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    className="library-example-choice"
                    aria-pressed={selected.id === example.id}
                    aria-controls={detailId}
                    onClick={() => setSelectedId(example.id)}
                  >
                    <span>{example.name}</span>
                    <small>{example.description}</small>
                  </button>
                </li>
              ))}
            </ul>
            <p>Código real de proyectos ficticios. Puedes explorarlo sin conectar un modelo.</p>
          </div>
          <div className="library-example-detail" id={detailId}>
            <div className="library-example-intro" aria-live="polite" aria-atomic="true">
              <h3>{selected.question}</h3>
              <p>{selected.context}</p>
            </div>
            <ol className="library-example-stages" aria-label="Etapas del recorrido">
              {selected.stages.map((stage) => (
                <li key={stage.path}>
                  <div className="library-stage-heading">
                    <span>{stage.title}</span>
                    <code>{stage.path}</code>
                  </div>
                  <p>{stage.description}</p>
                </li>
              ))}
            </ol>
            <div className="library-example-open">
              <button
                type="button"
                className="library-primary"
                onClick={() => onExample(selected.id)}
              >
                {selected.action}
              </button>
              <span>Predice, consulta el código y explica una variante.</span>
            </div>
          </div>
        </div>
      </section>

      <p className="library-local-note">
        {demo
          ? 'Esta vista pública usa ejemplos ficticios. Abre tus repositorios privados desde la app de Mac.'
          : 'Los archivos se indexan en este equipo. Tú decides si consultas un modelo.'}
      </p>
    </div>
  );
}
