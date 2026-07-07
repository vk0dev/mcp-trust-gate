import { normalizeRepositoryUrl, TargetResolutionError } from "./installGate.js";
import type { GitHubRepoMetadata, MetadataClient, NpmPackageMetadata, TargetMetadata } from "./types.js";

interface CacheEntry {
  expires: number;
  etag?: string;
  body: unknown;
}

const responseCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function cachedFetchJson(
  url: string,
  headers: Record<string, string> = {},
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const now = Date.now();
  const cached = responseCache.get(url);
  if (cached && cached.expires > now && cached.etag === undefined) {
    return { ok: true, status: 200, body: cached.body };
  }

  const reqHeaders = { ...headers };
  if (cached?.etag) {
    reqHeaders["If-None-Match"] = cached.etag;
  }

  const response = await fetch(url, { headers: reqHeaders });

  if (response.status === 304 && cached) {
    responseCache.set(url, { ...cached, expires: now + CACHE_TTL_MS });
    return { ok: true, status: 200, body: cached.body };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body: undefined };
  }

  const body = await response.json();
  const etag = response.headers.get("etag") ?? undefined;
  responseCache.set(url, { expires: now + CACHE_TTL_MS, etag, body });
  return { ok: true, status: response.status, body };
}

export class LiveMetadataClient implements MetadataClient {
  async fetchTarget(target: string): Promise<TargetMetadata> {
    const packageMetadata = await this.fetchPackageMetadata(target);
    if (!packageMetadata) {
      // npm 404: return a structured unresolvable target so evaluateInstallGate emits a
      // BLOCK verdict (target_resolvable = fail) instead of throwing.
      return { target, packageMetadata: undefined, githubRepo: undefined };
    }

    const repositoryUrl = normalizeRepositoryUrl(packageMetadata.repository);
    const githubRepo = repositoryUrl ? await this.tryFetchGitHubRepo(repositoryUrl) : undefined;

    return {
      target,
      packageMetadata,
      githubRepo,
    };
  }

  private async fetchPackageMetadata(target: string): Promise<NpmPackageMetadata | undefined> {
    const encodedTarget = encodeURIComponent(target);
    const { ok, status, body } = await cachedFetchJson(`https://registry.npmjs.org/${encodedTarget}/latest`);

    if (!ok) {
      // A 404 means the package genuinely does not exist -> treat as an unresolvable
      // target (BLOCK) rather than an error. Other statuses (429, 5xx, ...) mean we
      // could not verify, so keep surfacing them as errors.
      if (status === 404) {
        return undefined;
      }
      throw new TargetResolutionError(target, `npm registry lookup failed with ${status}`);
    }

    const payload = body as Record<string, unknown>;
    const version = asString(payload.version);
    const time = await this.fetchPackagePublishedAt(target, version);

    return {
      name: asString(payload.name) ?? target,
      version: version ?? "unknown",
      license: asString(payload.license),
      description: asString(payload.description),
      homepage: asString(payload.homepage),
      repository: normalizeRepositoryInput(payload.repository),
      bin: normalizeBinInput(payload.bin),
      keywords: asStringArray(payload.keywords),
      dependencies: asStringRecord(payload.dependencies),
      publishedAt: time,
    };
  }

  private async fetchPackagePublishedAt(target: string, version?: string): Promise<string | undefined> {
    if (!version) {
      return undefined;
    }

    const encodedTarget = encodeURIComponent(target);
    const { ok, body } = await cachedFetchJson(`https://registry.npmjs.org/${encodedTarget}`);
    if (!ok) {
      return undefined;
    }

    const payload = body as { time?: Record<string, string> };
    return payload.time?.[version];
  }

  private async tryFetchGitHubRepo(repositoryUrl: string): Promise<GitHubRepoMetadata | undefined> {
    const repoPath = extractGitHubRepoPath(repositoryUrl);
    if (!repoPath) {
      return undefined;
    }

    const { ok, body } = await cachedFetchJson(`https://api.github.com/repos/${repoPath}`, {
      "User-Agent": "mcp-trust-gate",
      Accept: "application/vnd.github+json",
    });

    if (!ok) {
      return undefined;
    }

    const payload = body as Record<string, unknown>;
    return {
      fullName: asString(payload.full_name) ?? repoPath,
      htmlUrl: asString(payload.html_url) ?? repositoryUrl,
      archived: Boolean(payload.archived),
      updatedAt: asString(payload.updated_at),
      pushedAt: asString(payload.pushed_at),
    };
  }
}

function extractGitHubRepoPath(url: string): string | undefined {
  const match = url.match(/github\.com\/([^/]+\/[^/#]+)/i);
  return match?.[1];
}

function normalizeRepositoryInput(value: unknown): NpmPackageMetadata["repository"] {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  const repo = value as Record<string, unknown>;
  return {
    type: asString(repo.type),
    url: asString(repo.url),
  };
}

function normalizeBinInput(value: unknown): NpmPackageMetadata["bin"] {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return undefined;
  }

  return toStringRecord(value as Record<string, unknown>);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.filter((entry): entry is string => typeof entry === "string");
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  return toStringRecord(value as Record<string, unknown>);
}

function toStringRecord(value: Record<string, unknown>): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "string") {
      result[key] = entry;
    }
  }

  return result;
}
