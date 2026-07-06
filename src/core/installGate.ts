import type {
  CheckKey,
  GateCheck,
  GitHubRepoMetadata,
  InstallGateResult,
  MetadataClient,
  NpmPackageMetadata,
  TargetMetadata,
  Verdict,
} from "./types.js";

const CHECK_ORDER: CheckKey[] = [
  "target_resolvable",
  "source_traceable",
  "maintenance_state",
  "access_domain",
  "secrets_required",
  "mutation_capability",
  "persistence",
  "deployment_clarity",
  "disclosure_quality",
];

const STALE_DAYS = 180;

const ACCESS_DOMAIN_RULES = [
  { pattern: /filesystem|file system|file access/i, signal: "filesystem access", impact: "REVIEW" },
  { pattern: /postgres|database|sql|mysql|mongodb|sqlite/i, signal: "database access", impact: "REVIEW" },
  { pattern: /browser|playwright|puppeteer|chromium|webkit|firefox/i, signal: "browser automation", impact: "REVIEW" },
  { pattern: /slack|discord|workspace|gmail|google drive|notion|jira|figma|design file/i, signal: "high-sensitivity saas or workspace context", impact: "REVIEW" },
  { pattern: /cloudflare|aws|gcp|azure|infra|infrastructure|dns|deploy|provision/i, signal: "infrastructure or control-plane access", impact: "REVIEW" },
  { pattern: /fetch|http|https|remote|proxy|sse|websocket|url|youtube/i, signal: "network or remote system access", impact: "REVIEW" },
  { pattern: /git|github|repo|repository/i, signal: "local repo or tooling access", impact: "GO" },
  { pattern: /memory|knowledge graph|notes/i, signal: "memory or retained context", impact: "REVIEW" },
];

const SECRET_RULES = [
  { pattern: /oauth|api key|apikey|access token|token|credential|secret|db url|database url|connection string/i, signal: "external credentials required" },
];

const MUTATION_RULES = [
  { pattern: /write|edit|modify|update|delete|create|commit|push|send|post|click|type|submit|trigger|provision|deploy|browser actions?|automation|execute|run command/i, signal: "state-changing or interactive external actions advertised" },
];

const PERSISTENCE_RULES = [
  { pattern: /memory|persist|persistence|retain|retention|cache|history|index|store|stored|knowledge graph|artifact|transcript/i, signal: "retained state, caches, indexes, or artifacts" },
];

const DEPLOYMENT_VAGUE_RULES = [
  { pattern: /remote|proxy|hosted|production|workspace|browser automation|database|credential|oauth|external/i, signal: "deployment assumptions need manual review" },
];

const DISCLOSURE_GAP_RULES = [
  { pattern: /token-efficient|productivity|convenient|helper|easy|simple|quick/i, signal: "benefit-heavy framing" },
  { pattern: /entire api|all-in-one|full access/i, signal: "broad scope compressed into short marketing language" },
  { pattern: /read-only/i, signal: "read-only framing can understate context sensitivity" },
];

export class TargetResolutionError extends Error {
  constructor(target: string, message = "Target could not be resolved") {
    super(message);
    this.name = "TargetResolutionError";
    this.target = target;
  }

  target: string;
}

export async function evaluateInstallGate(
  target: string,
  client: MetadataClient,
): Promise<InstallGateResult> {
  const metadata = await client.fetchTarget(target);
  return evaluateInstallGateFromMetadata(metadata);
}

export function evaluateInstallGateFromMetadata(metadata: TargetMetadata): InstallGateResult {
  const target = metadata.target;
  const pkg = metadata.packageMetadata;
  const repo = metadata.githubRepo;

  const checksByKey = new Map<CheckKey, GateCheck>();
  checksByKey.set("target_resolvable", evaluateResolvable(target, pkg));
  checksByKey.set("source_traceable", evaluateSourceTraceability(pkg, repo));
  checksByKey.set("maintenance_state", evaluateMaintenanceState(pkg, repo));
  checksByKey.set("access_domain", evaluateAccessDomain(pkg));
  checksByKey.set("secrets_required", evaluateSecretsRequired(pkg));
  checksByKey.set("mutation_capability", evaluateMutationCapability(pkg));
  checksByKey.set("persistence", evaluatePersistence(pkg));
  checksByKey.set("deployment_clarity", evaluateDeploymentClarity(pkg));
  checksByKey.set("disclosure_quality", evaluateDisclosureQuality(pkg));

  const checks = CHECK_ORDER.map((key) => checksByKey.get(key) as GateCheck);
  const verdict = determineVerdict(checks);
  const reasons = buildReasons(checks, repo);
  const recommendedActions = buildRecommendedActions(checks, verdict);
  const evidence = buildEvidence(target, pkg, repo);
  const summary = buildSummary(verdict, reasons);

  return {
    target,
    targetType: "npm",
    verdict,
    summary,
    checks,
    reasons,
    recommendedActions,
    evidence,
  };
}

function evaluateResolvable(target: string, pkg?: NpmPackageMetadata): GateCheck {
  if (!pkg) {
    return {
      key: "target_resolvable",
      status: "fail",
      impact: "BLOCK",
      signal: "package metadata missing",
      note: `npm target ${target} did not resolve to a package metadata record.`,
    };
  }

  return {
    key: "target_resolvable",
    status: "pass",
    impact: "GO",
    signal: `${pkg.name}@${pkg.version}`,
    note: "Package resolved cleanly for bounded install-gate evaluation.",
  };
}

function evaluateSourceTraceability(pkg?: NpmPackageMetadata, repo?: GitHubRepoMetadata): GateCheck {
  const repositoryUrl = normalizeRepositoryUrl(pkg?.repository);

  if (repo) {
    return {
      key: "source_traceable",
      status: "pass",
      impact: "score",
      signal: repo.fullName,
      note: "Package maps to a reachable public source repository.",
    };
  }

  if (repositoryUrl || pkg?.homepage) {
    return {
      key: "source_traceable",
      status: "warn",
      impact: "REVIEW",
      signal: repositoryUrl ?? pkg?.homepage ?? "source pointer present",
      note: "Package exposes a source pointer, but the upstream repository could not be validated during evaluation.",
    };
  }

  return {
    key: "source_traceable",
    status: "warn",
    impact: "REVIEW",
    signal: "no public source pointer",
    note: "Package does not expose a public repository or homepage that can be inspected before enablement.",
  };
}

function evaluateMaintenanceState(pkg?: NpmPackageMetadata, repo?: GitHubRepoMetadata): GateCheck {
  if (repo?.archived) {
    return {
      key: "maintenance_state",
      status: "fail",
      impact: "BLOCK",
      signal: `${repo.fullName} is archived`,
      note: "Archived upstreams are hard-blocked in V1.",
    };
  }

  const freshnessSource = repo?.pushedAt ?? repo?.updatedAt ?? pkg?.publishedAt;
  if (!freshnessSource) {
    return {
      key: "maintenance_state",
      status: "warn",
      impact: "REVIEW",
      signal: "no activity timestamp",
      note: "No recent package publish or repository activity timestamp was available.",
    };
  }

  const ageDays = ageInDays(freshnessSource);
  if (ageDays > STALE_DAYS) {
    return {
      key: "maintenance_state",
      status: "warn",
      impact: "REVIEW",
      signal: `${ageDays} days since last activity`,
      note: `Latest observable activity exceeds the ${STALE_DAYS}-day staleness threshold.`,
    };
  }

  return {
    key: "maintenance_state",
    status: "pass",
    impact: "GO",
    signal: `${ageDays} days since last activity`,
    note: "Recent package or repository activity was observed.",
  };
}

function evaluateAccessDomain(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = ACCESS_DOMAIN_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "access_domain",
      status: "warn",
      impact: "REVIEW",
      signal: "access domain unclear",
      note: "Metadata does not make it obvious what system the model can touch.",
    };
  }

  return {
    key: "access_domain",
    status: match.impact === "GO" ? "pass" : "warn",
    impact: match.impact as "GO" | "REVIEW",
    signal: match.signal,
    note:
      match.impact === "GO"
        ? `Metadata points to a lower-ambiguity access domain: ${match.signal}.`
        : `Metadata advertises a trust-relevant access domain: ${match.signal}.`,
  };
}

function evaluateSecretsRequired(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = SECRET_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "secrets_required",
      status: "pass",
      impact: "GO",
      signal: "no explicit external credentials detected",
      note: "Metadata does not advertise tokens, OAuth, or service credentials as install prerequisites.",
    };
  }

  return {
    key: "secrets_required",
    status: "warn",
    impact: "REVIEW",
    signal: match.signal,
    note: "Install appears to depend on external credentials or tokens, so manual review is required.",
  };
}

function evaluateMutationCapability(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = MUTATION_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "mutation_capability",
      status: "pass",
      impact: "GO",
      signal: "read-oriented framing only",
      note: "Metadata does not clearly advertise state-changing or interactive external actions.",
    };
  }

  return {
    key: "mutation_capability",
    status: "warn",
    impact: "REVIEW",
    signal: match.signal,
    note: "Metadata suggests the server can change state or trigger interactive external actions.",
  };
}

function evaluatePersistence(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = PERSISTENCE_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "persistence",
      status: "pass",
      impact: "GO",
      signal: "no retained artifacts or cache signal detected",
      note: "Metadata does not advertise retained state, caches, indexes, transcripts, or durable artifacts.",
    };
  }

  return {
    key: "persistence",
    status: "warn",
    impact: "REVIEW",
    signal: match.signal,
    note: "Metadata suggests retained state, caches, indexes, transcripts, or durable artifacts that change the trust posture.",
  };
}

function evaluateDeploymentClarity(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = DEPLOYMENT_VAGUE_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "deployment_clarity",
      status: "pass",
      impact: "GO",
      signal: "local install assumptions look straightforward",
      note: "Metadata does not suggest complicated deployment assumptions beyond a normal local MCP install.",
    };
  }

  return {
    key: "deployment_clarity",
    status: "warn",
    impact: "REVIEW",
    signal: match.signal,
    note: "Install metadata implies deployment assumptions that should be reviewed by an operator.",
  };
}

function evaluateDisclosureQuality(pkg?: NpmPackageMetadata): GateCheck {
  const haystack = collectText(pkg);
  const match = DISCLOSURE_GAP_RULES.find((rule) => rule.pattern.test(haystack));

  if (!match) {
    return {
      key: "disclosure_quality",
      status: "pass",
      impact: "GO",
      signal: "operator-facing framing looks clear",
      note: "Metadata does not obviously soften trust cues behind benefit-heavy or compressed framing.",
    };
  }

  return {
    key: "disclosure_quality",
    status: "warn",
    impact: "REVIEW",
    signal: match.signal,
    note: "Docs or metadata appear technically true but under-frame the access, action, or runtime trust surface for a non-expert operator.",
  };
}

function determineVerdict(checks: GateCheck[]): Verdict {
  if (checks.some((check) => check.impact === "BLOCK" && check.status === "fail")) {
    return "BLOCK";
  }

  const hasReview = (key: CheckKey) => checks.some((check) => check.key === key && check.status === "warn");
  const broadTrustRisk = hasReview("access_domain") && hasReview("mutation_capability");
  const disclosureWeakness = hasReview("deployment_clarity") || hasReview("source_traceable") || hasReview("disclosure_quality");

  if (broadTrustRisk && disclosureWeakness) {
    return "BLOCK";
  }

  if (checks.some((check) => check.status === "warn" || check.status === "fail")) {
    return "REVIEW";
  }

  return "GO";
}

function buildReasons(checks: GateCheck[], repo?: GitHubRepoMetadata): string[] {
  const reasons: string[] = [];
  const get = (key: CheckKey) => checks.find((check) => check.key === key);

  const resolvable = get("target_resolvable");
  const maintenance = get("maintenance_state");
  const access = get("access_domain");
  const secrets = get("secrets_required");
  const mutation = get("mutation_capability");
  const persistence = get("persistence");
  const deployment = get("deployment_clarity");
  const disclosure = get("disclosure_quality");
  const traceability = get("source_traceable");

  if (resolvable?.status === "fail") {
    reasons.push("Target identity could not be resolved cleanly before install.");
  }
  if (maintenance?.status === "fail") {
    reasons.push("Upstream repository is archived, so V1 install gate hard-blocks enablement.");
  }
  if (access?.status === "warn") {
    reasons.push(`Trust-relevant access domain: ${access.signal}.`);
  }
  if (secrets?.status === "warn") {
    reasons.push(`Secrets or external credentials required: ${secrets.signal}.`);
  }
  if (mutation?.status === "warn") {
    reasons.push(`State-changing or interactive external action advertised: ${mutation.signal}.`);
  }
  if (persistence?.status === "warn") {
    reasons.push(`Persistence, retained artifacts, or cache review needed: ${persistence.signal}.`);
  }
  if (deployment?.status === "warn") {
    reasons.push(`Deployment assumptions are not low-ambiguity: ${deployment.signal}.`);
  }
  if (disclosure?.status === "warn") {
    reasons.push(`Disclosure quality needs operator review: ${disclosure.signal}.`);
  }
  if (traceability?.status === "pass" && repo) {
    reasons.push(`Source traceable to ${repo.fullName}.`);
  }
  if (traceability?.status === "warn") {
    reasons.push("Public source is not fully traceable from package metadata alone.");
  }
  if (maintenance?.status === "pass") {
    reasons.push("Project shows recent maintenance activity.");
  }

  return unique(reasons).slice(0, 4);
}

function buildRecommendedActions(checks: GateCheck[], verdict: Verdict): string[] {
  const actions: string[] = [];

  if (verdict === "BLOCK") {
    actions.push("Do not install or enable this target until the blocking issue is resolved.");
  }

  if (hasWarn(checks, "access_domain")) {
    actions.push("Confirm the exact system boundary this server can access before enablement.");
  }
  if (hasWarn(checks, "secrets_required")) {
    actions.push("Review credential scope, storage path, and least-privilege fit before install.");
  }
  if (hasWarn(checks, "mutation_capability")) {
    actions.push("Require manual approval before enabling state-changing or interactive external actions.");
  }
  if (hasWarn(checks, "persistence")) {
    actions.push("Review what data is retained, where it lives, and how it is cleared.");
  }
  if (hasWarn(checks, "deployment_clarity")) {
    actions.push("Confirm whether the target is suitable only for local use or for a broader environment.");
  }
  if (hasWarn(checks, "disclosure_quality")) {
    actions.push("Do not rely on benefit-heavy README framing alone; restate the access, action, and runtime assumptions before install.");
  }
  if (hasWarn(checks, "source_traceable")) {
    actions.push("Inspect package tarball or request a public source repository before enablement.");
  }

  return unique(actions);
}

function buildEvidence(target: string, pkg?: NpmPackageMetadata, repo?: GitHubRepoMetadata) {
  const evidence: InstallGateResult["evidence"] = [
    { kind: "npm", ref: `https://registry.npmjs.org/${encodeURIComponent(target)}/latest` },
  ];
  const repositoryUrl = normalizeRepositoryUrl(pkg?.repository);

  if (repositoryUrl) {
    evidence.push({ kind: "npm" as const, ref: repositoryUrl });
  }
  if (repo) {
    evidence.push({ kind: "github" as const, ref: repo.htmlUrl });
  }

  return evidence;
}

function buildSummary(verdict: Verdict, reasons: string[]): string {
  const topReasons = reasons.slice(0, 2).join(" ");

  if (topReasons) {
    return `${verdict}: ${topReasons}`;
  }

  return `${verdict}: deterministic V1 install gate completed.`;
}

function collectText(pkg?: NpmPackageMetadata): string {
  return [
    pkg?.name,
    pkg?.description,
    ...Object.keys(normalizeBin(pkg?.bin)),
    ...Object.values(normalizeBin(pkg?.bin)),
    ...(pkg?.keywords ?? []),
    normalizeRepositoryUrl(pkg?.repository),
    pkg?.homepage,
  ]
    .filter(Boolean)
    .join(" ");
}

export function normalizeRepositoryUrl(repository?: NpmPackageMetadata["repository"]): string | undefined {
  const raw = typeof repository === "string" ? repository : repository?.url;
  if (!raw) {
    return undefined;
  }

  return raw.replace(/^git\+/, "").replace(/\.git$/, "");
}

function normalizeBin(bin?: NpmPackageMetadata["bin"]): Record<string, string> {
  if (!bin) {
    return {};
  }

  if (typeof bin === "string") {
    return { default: bin };
  }

  return bin;
}

function ageInDays(timestamp: string): number {
  const activityTime = new Date(timestamp).getTime();
  const now = Date.now();
  const diff = now - activityTime;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
}

function hasWarn(checks: GateCheck[], key: CheckKey): boolean {
  return checks.some((check) => check.key === key && check.status === "warn");
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
