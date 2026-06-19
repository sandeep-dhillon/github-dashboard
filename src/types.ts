export type CheckState = "success" | "failure" | "pending" | "neutral" | "none";
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | "COMMENTED" | "DISMISSED";

export interface PRSearchItem {
  id: number;
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed";
  draft: boolean;
  created_at: string;
  updated_at: string;
  repository_url: string; // https://api.github.com/repos/owner/repo
  user: { login: string; avatar_url: string };
  labels: { name: string; color: string }[];
  pull_request?: { merged_at: string | null };
  body?: string | null;
}

export interface PRDetails {
  head: { ref: string; sha: string; repo: { full_name: string; default_branch: string } };
  base: { ref: string };
  mergeable: boolean | null;
  mergeable_state: string;
  additions: number;
  deletions: number;
  changed_files: number;
  requested_reviewers: { login: string; avatar_url: string }[];
}

export interface CombinedStatus {
  state: CheckState;
  total: number;
  failing: number;
  pending: number;
  passing: number;
  failingChecks: { name: string; url: string }[];
}

export interface PRReviewSummary {
  approved: number;
  changesRequested: number;
  approvedBy: string[];
  changesRequestedBy: string[];
  lastReviewState: ReviewState | null;
}

export type StagingConclusion =
  | "success"
  | "failure"
  | "cancelled"
  | "timed_out"
  | "in_progress"
  | "queued"
  | "none";

export interface DeployStatus {
  onStaging: boolean;
  onMaster: boolean;
  stagingSha?: string;
  masterSha?: string;
  stagingRunUrl?: string;
  stagingUpdatedAt?: string;
  method: "deployments-api" | "workflow-run" | "tag" | "unknown";
  // True if the latest run we found was for this PR's branch (not some other branch).
  stagingBranchMatch: boolean;
  // Outcome of the most recent staging deploy run for this branch (if any).
  stagingConclusion: StagingConclusion;
  // The branch currently on staging (from the most recent deploy run / deployment), when known.
  stagingBranch?: string;
}

export interface DeployWorkflow {
  id: number;
  name: string;
  path: string;
  ref?: string; // default ref to dispatch on
}

export interface EnrichedPR {
  item: PRSearchItem;
  repo: string; // owner/name
  owner: string;
  name: string;
  details?: PRDetails;
  checks?: CombinedStatus;
  reviews?: PRReviewSummary;
  deploy?: DeployStatus;
  deployWorkflow?: DeployWorkflow | null;
  featureKey: string;
  loading?: boolean;
  error?: string;
}

export interface RepoConfig {
  // owner/name → overrides
  stagingEnvironment?: string;
  deployWorkflow?: string; // file name e.g. "deploy-staging.yml"
  deployRef?: string;
}
