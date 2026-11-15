import type {
  ImportRequest,
  Job,
  Learning,
  ProjectSummary,
  Snapshot,
  SourceFile,
} from '../shared/types';
export const DEMO = import.meta.env.VITE_DEMO === 'true';
export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, data?: unknown, method?: string): Promise<T> {
  if (DEMO) return (await import('./demo')).demoRequest(path, data, method) as Promise<T>;
  const response = await fetch('/api' + path, {
    method: method || (data === undefined ? 'GET' : 'POST'),
    headers: { 'Content-Type': 'application/json', 'X-Trama-Request': '1' },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const payload = await response
    .json()
    .catch(() => ({ error: 'La respuesta del servidor está incompleta.' }));
  if (!response.ok)
    throw new RequestError(
      payload.error || payload.message || 'No se pudo completar la operación.',
      response.status,
      payload.code,
    );
  return payload as T;
}
export const api = {
  projects: () => request<ProjectSummary[]>('/projects'),
  snapshot: (id: string) => request<Snapshot>('/snapshots/' + encodeURIComponent(id)),
  import: (input: ImportRequest) => request<{ jobId: string }>('/import', input),
  job: (id: string) => request<Job>('/jobs/' + encodeURIComponent(id)),
  file: (id: string, path: string) =>
    request<SourceFile>(
      '/snapshots/' + encodeURIComponent(id) + '/file?path=' + encodeURIComponent(path),
    ),
  save: (id: string, value: Learning, version: number) =>
    request<{ value: Learning; version: number }>(
      '/snapshots/' + encodeURIComponent(id) + '/learning',
      { value, version },
      'PUT',
    ),
  search: (id: string, q: string) =>
    request<{ matches: { path: string; line: number; text: string }[] }>(
      '/snapshots/' + encodeURIComponent(id) + '/search?q=' + encodeURIComponent(q),
    ),
};
export function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  );
  const element = document.createElement('a');
  element.href = url;
  element.download = name;
  element.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
