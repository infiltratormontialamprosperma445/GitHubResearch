import {
  RateLimitState,
  Repository,
  RequestCacheEntry,
  SourceHealth,
  SourceObservation,
  TrendWindow
} from "../../src/shared/types.js";

export interface SourceSettings {
  githubToken?: string;
  bigQueryProjectId?: string;
  proxyUrl?: string;
  cacheTtlHours?: number;
  maxReposPerWindow?: number;
  getCache?: (key: string) => RequestCacheEntry | undefined;
  setCache?: (entry: RequestCacheEntry) => void;
  recordRateLimit?: (state: RateLimitState) => void;
}

export interface DiscoveredRepository {
  repo: Repository;
  observation: SourceObservation;
}

export interface SourceAdapter {
  id: string;
  label: string;
  weight: number;
  supportsBackfill: boolean;
  maxConcurrency: number;
  discover(window: TrendWindow, settings: SourceSettings): Promise<DiscoveredRepository[]>;
  health(settings: SourceSettings): Promise<SourceHealth>;
  rateLimit(settings: SourceSettings): Promise<RateLimitState | undefined>;
  validateSettings(settings: SourceSettings): Promise<{ ok: boolean; message: string }>;
}
