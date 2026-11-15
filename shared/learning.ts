import type { Anchor, EvidenceStatus } from './types.js';

export interface ProviderConfig {
  endpoint: string;
  model: string;
  configured: boolean;
  hasKey: boolean;
  isLocal: boolean;
}
export interface ProviderInput {
  endpoint: string;
  model: string;
  apiKey?: string;
  allowRemote?: boolean;
  expectedEndpoint?: string;
}
export interface ChatGPTModel {
  slug: string;
  displayName: string;
}
export interface ChatGPTStatus {
  available: boolean;
  connected: boolean;
  sharing: boolean;
  profileId?: string;
  email?: string;
  model: string;
  models: ChatGPTModel[];
  phase: 'idle' | 'connecting' | 'connected' | 'error';
  authUrl?: string;
  error?: string;
  errorCode?: string;
  usageUrl: string;
  welcomeSeen?: boolean;
  storage?: 'encrypted' | 'unavailable';
}
export interface Claim {
  text: string;
  status: EvidenceStatus;
  sources: Anchor[];
}
export interface TutorAnswer {
  summary: string;
  claims: Claim[];
  example?: { title: string; description: string; input: string; output: string };
  nextQuestion: string;
}
export interface AskResult {
  answer: TutorAnswer;
  context: { files: string[]; bytes: number; rejectedReferences: number };
  model: string;
  provider?: 'api' | 'chatgpt';
  verification: 'references-only';
}
export interface Exercise {
  id: string;
  title: string;
  prompt: string;
  kind: 'predict' | 'trace' | 'transfer';
  processId?: string;
  sources: Anchor[];
  expectedAnswer: string;
  rubric: string[];
}
