/** Shared contracts. Adapters expose metadata; classifiers return scores; policy decides. */
export interface Rule {
  id: string;
  name: string;
  description: string;
  instructions: string;
  trueCriteria: string;
  falseCriteria: string;
  threshold: number;
  enabled: boolean;
  builtin: boolean;
}
export interface Config {
  enabled: boolean;
  onboardingCompleted: boolean;
  rulesVersion: number;
  recommendationsOnly: boolean;
  failOpen: boolean;
  preload: boolean;
  showPlaceholder: boolean;
  showConfidence: boolean;
  showCheckControls: boolean;
  maxConcurrency: number;
  cacheTtlHours: number;
  dailyLimit: number;
  debug: boolean;
  model: string;
  apiEndpoint: string;
  rules: Rule[];
  typesafeApiKey?: string;
}
export interface ContentItem {
  source: string;
  id: string;
  type: string;
  title: string;
  author: string;
  text: string;
}
export interface PageContext {
  key: string;
  kind: string;
  videoId?: string | null;
}
export interface ContentAdapter {
  id: string;
  itemLabel?: string;
  matches(url: string): boolean;
  getContext(url: string): PageContext | null;
  collect(root: Document, context: PageContext): HTMLElement[];
  extract(card: HTMLElement, context: PageContext | null): ContentItem | null;
  isInScope(card: HTMLElement, context: PageContext | null): boolean;
  navigation?: { start: string[]; finish: string[] };
  observedAttributes?: string[];
}
export interface Match {
  ruleId: string;
  name: string;
  probability: number;
  threshold: number;
}
export interface Decision {
  results: Record<string, number>;
  matches: Match[];
  shouldHide: boolean;
}
export type Failure = { ok: false; error: string };
export type ClassificationResult =
  Failure | ({ ok: true; cache?: 'hit' | 'miss'; latencyMs?: number } & Decision);
export interface ClassificationRequest {
  apiKey: string;
  model: string;
  content: ContentItem;
  rules: Rule[];
}
export interface Classifier {
  readonly id: string;
  classify(
    request: ClassificationRequest
  ): Promise<{ scores: Record<string, number>; latencyMs: number }>;
}
export interface Stats {
  day: string;
  requests: number;
  checked: number;
  hidden: number;
  totalChecked: number;
  totalHidden: number;
  cacheHits: number;
  errors: number;
  latencyMs: number;
  lastError: string;
  pageChecked: number;
  pageHidden: number;
  pageSafe: number;
  pagePending: number;
  pageErrors: number;
  pageLatencyMs: number;
}
export type StatsChanges = Partial<Stats> &
  Partial<
    Record<
      'requestsDelta' | 'cacheHitsDelta' | 'errorsDelta' | 'checkedDelta' | 'hiddenDelta',
      number
    >
  >;
export interface StorageArea {
  get(key: string, callback: (values: Record<string, unknown>) => void): void;
  set(values: Record<string, unknown>, callback: () => void): void;
  remove(key: string, callback: () => void): void;
}
export interface StorageRuntime {
  storage: { local: StorageArea; session?: StorageArea };
}
export interface AppState {
  config: Config;
  stats: Stats;
  hasApiKey: boolean;
  needsOnboarding: boolean;
  apiKeyMask: string;
}
export interface MessagePayloads {
  GET_STATE: undefined;
  SAVE_API_KEY: { apiKey: string };
  TEST_CONNECTION: { apiKey?: string } | undefined;
  OPEN_ONBOARDING: undefined;
  CLASSIFY_CONTENT: { content?: unknown; force?: boolean };
  SAVE_CONFIG: Partial<Config>;
  RECORD_CONTENT_EVENT: {
    action?: string;
    page?: Partial<
      Record<'checked' | 'hidden' | 'safe' | 'pending' | 'errors' | 'latencyMs', number>
    >;
  };
  CLEAR_CACHE: undefined;
  OPEN_SETTINGS: undefined;
}
export interface MessageSuccesses {
  GET_STATE: { ok: true } & AppState;
  SAVE_API_KEY: { ok: true; hasApiKey: boolean; apiKeyMask: string };
  TEST_CONNECTION: { ok: true; latencyMs: number };
  OPEN_ONBOARDING: { ok: true };
  CLASSIFY_CONTENT: Exclude<ClassificationResult, Failure>;
  SAVE_CONFIG: { ok: true; config: Config };
  RECORD_CONTENT_EVENT: { ok: true };
  CLEAR_CACHE: { ok: true };
  OPEN_SETTINGS: { ok: true };
}
export type MessageType = keyof MessagePayloads;
export type Message = { [K in MessageType]: { type: K; payload: MessagePayloads[K] } }[MessageType];
export type MessageResponse<K extends MessageType> = MessageSuccesses[K] | Failure;
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
