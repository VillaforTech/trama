export type EvidenceStatus = 'source' | 'inferred' | 'unknown';
export interface Anchor {
  path: string;
  line: number;
  end: number;
  excerpt: string;
  url?: string;
}
export interface Step {
  title: string;
  detail: string;
  status: EvidenceStatus;
  sources: Anchor[];
}
export interface Process {
  id: string;
  title: string;
  description: string;
  status: EvidenceStatus;
  sources: Anchor[];
  steps: Step[];
}
export interface Unit {
  id: string;
  title: string;
  description: string;
  status: EvidenceStatus;
  reason: string;
  sources: Anchor[];
  processes: Process[];
  related: { id: string; title: string; reason: string; sources?: Anchor[] }[];
}
export interface Plan {
  summary: string;
  summarySource?: Anchor | null;
  architecture: Unit[];
  features: Unit[];
  coverage: Record<string, unknown>;
}
export interface SourceFile {
  path: string;
  text: string;
  size: number;
  hash?: string;
  language?: string;
  url?: string;
}
export interface GraphAnalysis {
  version: 1;
  parsedFiles: number;
  candidateFiles: number;
  otherFiles: number;
  unresolvedLocalImports: number;
  externalImports: number;
  dynamicImports: number;
  limitations: string[];
}
export interface Graph {
  /** Capture-time analysis coverage. Older captures may not contain this field. */
  analysis?: GraphAnalysis;
  nodes: { id: string; label: string; kind: string; path: string; symbols: string[] }[];
  edges: { id: string; source: string; target: string; kind: string; line: number }[];
}
export interface Learning {
  position?: { view: string; unit?: string; process?: string; step?: number };
  notes?: string;
  answers?: Record<
    string,
    {
      prediction?: string;
      revealed?: boolean;
      hintUsed?: boolean;
      reflection?: string;
      review?: 'match' | 'gap';
      variant?: string;
      updatedAt?: string;
    }
  >;
  sessions?: { id: string; question: string; answer: unknown; createdAt: string }[];
  attempts?: {
    id: string;
    exerciseId: string;
    answer: string;
    assisted: boolean;
    review: 'correct' | 'partial' | 'gap';
    createdAt: string;
    dueAt: string;
  }[];
}
export interface ProjectSummary {
  id: string;
  name: string;
  source: 'local' | 'github' | 'example';
  location: string;
  latestSnapshotId: string;
  updatedAt: string;
  fileCount: number;
}
export interface Snapshot {
  id: string;
  projectId: string;
  name: string;
  source: 'local' | 'github' | 'example';
  location: string;
  revision: string;
  createdAt: string;
  files: Omit<SourceFile, 'text'>[];
  coverage: { indexed: number; skipped: number; bytes: number; limitations: string[] };
  plan: Plan;
  graph: Graph;
  learning: Learning;
  learningVersion: number;
}
export interface ImportRequest {
  kind: 'local' | 'github' | 'example';
  path?: string;
  repo?: string;
  token?: string;
  example?: string;
}
export interface Job {
  id: string;
  status: 'running' | 'complete' | 'failed';
  phase: string;
  progress: number;
  snapshotId?: string;
  error?: string;
}
