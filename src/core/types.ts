export type Verdict = "GO" | "REVIEW" | "BLOCK";

export type CheckKey =
  | "target_resolvable"
  | "source_traceable"
  | "maintenance_state"
  | "access_domain"
  | "secrets_required"
  | "mutation_capability"
  | "persistence"
  | "deployment_clarity"
  | "disclosure_quality";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type CheckImpact = "GO" | "REVIEW" | "BLOCK" | "score";
export type EvidenceKind = "npm" | "github" | "readme" | "manual";

export interface GateCheck {
  key: CheckKey;
  status: CheckStatus;
  impact: CheckImpact;
  signal: string;
  note: string;
}

export interface GateEvidence {
  kind: EvidenceKind;
  ref: string;
}

export interface InstallGateResult {
  target: string;
  targetType: "npm";
  verdict: Verdict;
  summary: string;
  checks: GateCheck[];
  reasons: string[];
  recommendedActions: string[];
  evidence: GateEvidence[];
}

export interface PackageRepository {
  type?: string;
  url?: string;
}

export interface NpmPackageMetadata {
  name: string;
  version: string;
  license?: string;
  description?: string;
  homepage?: string;
  repository?: string | PackageRepository;
  bin?: string | Record<string, string>;
  keywords?: string[];
  dependencies?: Record<string, string>;
  publishedAt?: string;
}

export interface GitHubRepoMetadata {
  fullName: string;
  htmlUrl: string;
  archived: boolean;
  updatedAt?: string;
  pushedAt?: string;
}

export interface TargetMetadata {
  target: string;
  packageMetadata?: NpmPackageMetadata;
  githubRepo?: GitHubRepoMetadata;
}

export interface MetadataClient {
  fetchTarget(target: string): Promise<TargetMetadata>;
}

export interface Fingerprint {
  package: string;
  version: string;
  generatedAt: string; // ISO timestamp
  checks: Array<{ key: CheckKey; status: CheckStatus; signal: string }>;
  verdict: Verdict;
  accessDomain: string | null;
  mutationCapability: string | null;
  secretsRequired: string | null;
  persistence: string | null;
}

export interface FingerprintDiff {
  changed: string[];
  baseline: Fingerprint;
  current: Fingerprint;
}

export interface DriftResult {
  driftDetected: boolean;
  diff: FingerprintDiff | null;
}
