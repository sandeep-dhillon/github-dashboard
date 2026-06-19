import type {
  PRSearchItem,
  PRDetails,
  CombinedStatus,
  PRReviewSummary,
  DeployStatus,
  DeployWorkflow,
  CheckState,
} from "../types";

function getApiBase(): string {
  try {
    const s = JSON.parse(localStorage.getItem("gh_settings_v1") || "{}");
    return (s.apiBase as string) || "https://api.github.com";
  } catch {
    return "https://api.github.com";
  }
}

function getOrgScope(): string {
  try {
    const s = JSON.parse(localStorage.getItem("gh_settings_v1") || "{}");
    return ((s.orgScope as string) || "").trim();
  } catch {
    return "";
  }
}

// Patterns that look like GitHub tokens: classic PAT (ghp_…), fine-grained (github_pat_…),
// OAuth (gho_…), refresh/installation (ghr_/ghs_/ghu_/ghv_…), and 40-char hex legacy tokens.
const TOKEN_PATTERNS = [
  /gh[oprsuv]_[A-Za-z0-9]{16,255}/g,
  /github_pat_[A-Za-z0-9_]{20,}/g,
  /\b[a-f0-9]{40}\b/g,
];

export function redactSecrets(s: string): string {
  if (!s) return s;
  let out = s;
  for (const re of TOKEN_PATTERNS) out = out.replace(re, "[redacted]");
  // Also drop anything that looks like a Bearer header echo.
  out = out.replace(/Bearer\s+[A-Za-z0-9_\-]+/gi, "Bearer [redacted]");
  return out;
}

let TOKEN = "";
export function setToken(t: string) {
  TOKEN = t;
  localStorage.setItem("gh_token", t);
}
export function getToken() {
  if (!TOKEN) TOKEN = localStorage.getItem("gh_token") || "";
  return TOKEN;
}
export function clearToken() {
  TOKEN = "";
  localStorage.removeItem("gh_token");
}

async function gh<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const base = getApiBase();
  const res = await fetch(path.startsWith("http") ? path : `${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}: ${redactSecrets(txt).slice(0, 200)}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function whoami(): Promise<{ login: string; avatar_url: string; name: string }> {
  return gh("/user");
}

export async function searchPRs(query: string): Promise<PRSearchItem[]> {
  const q = encodeURIComponent(query);
  const data = await gh<{ items: PRSearchItem[] }>(
    `/search/issues?q=${q}&sort=updated&order=desc&per_page=100`,
  );
  return data.items;
}

export async function searchMyOpenPRs(login: string): Promise<{ items: PRSearchItem[]; queryUsed: string }> {
  const org = getOrgScope();
  const scope = org ? `org:${org} ` : "";
  const queries = [
    `${scope}is:open is:pr author:${login} archived:false`,
    `${scope}is:open is:pr involves:${login} archived:false`,
  ];
  for (const q of queries) {
    const items = await searchPRs(q.trim());
    if (items.length) return { items, queryUsed: q.trim() };
  }
  return { items: [], queryUsed: queries[0].trim() };
}

export async function checkTokenScopes(): Promise<{ scopes: string[]; login: string }> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}/user`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  const scopes = (res.headers.get("x-oauth-scopes") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = await res.json();
  return { scopes, login: body.login };
}

export async function getPRDetails(owner: string, repo: string, num: number): Promise<PRDetails> {
  return gh(`/repos/${owner}/${repo}/pulls/${num}`);
}

interface CheckRunsResp {
  total_count: number;
  check_runs: {
    name: string;
    status: "queued" | "in_progress" | "completed";
    conclusion: string | null;
    html_url: string;
  }[];
}
interface StatusResp {
  state: "success" | "failure" | "pending" | "error";
  statuses: { context: string; state: string; target_url: string | null }[];
}

export async function getCombinedChecks(
  owner: string,
  repo: string,
  sha: string,
): Promise<CombinedStatus> {
  const [runs, status] = await Promise.all([
    gh<CheckRunsResp>(`/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`),
    gh<StatusResp>(`/repos/${owner}/${repo}/commits/${sha}/status`),
  ]);

  let passing = 0,
    failing = 0,
    pending = 0;
  const failingChecks: { name: string; url: string }[] = [];

  for (const r of runs.check_runs) {
    if (r.status !== "completed") {
      pending++;
      continue;
    }
    if (r.conclusion === "success" || r.conclusion === "neutral" || r.conclusion === "skipped") {
      passing++;
    } else if (r.conclusion === "failure" || r.conclusion === "timed_out" || r.conclusion === "cancelled" || r.conclusion === "action_required") {
      failing++;
      failingChecks.push({ name: r.name, url: r.html_url });
    } else {
      passing++;
    }
  }
  for (const s of status.statuses) {
    if (s.state === "success") passing++;
    else if (s.state === "pending") pending++;
    else {
      failing++;
      failingChecks.push({ name: s.context, url: s.target_url || "" });
    }
  }

  const total = passing + failing + pending;
  let state: CheckState = "none";
  if (total === 0) state = "none";
  else if (failing > 0) state = "failure";
  else if (pending > 0) state = "pending";
  else state = "success";

  return { state, total, failing, pending, passing, failingChecks };
}

interface ReviewResp {
  state: string;
  user: { login: string; avatar_url: string } | null;
  submitted_at: string;
}

export async function getReviews(
  owner: string,
  repo: string,
  num: number,
): Promise<PRReviewSummary> {
  const reviews = await gh<ReviewResp[]>(`/repos/${owner}/${repo}/pulls/${num}/reviews?per_page=100`);
  // Latest review per user
  const latestByUser = new Map<string, ReviewResp>();
  for (const r of reviews) {
    if (!r.user) continue;
    const prev = latestByUser.get(r.user.login);
    if (!prev || new Date(r.submitted_at) > new Date(prev.submitted_at)) {
      latestByUser.set(r.user.login, r);
    }
  }
  let approved = 0,
    changes = 0;
  const approvedBy: string[] = [];
  const changesBy: string[] = [];
  let last: ReviewResp | null = null;
  for (const r of latestByUser.values()) {
    if (r.state === "APPROVED") {
      approved++;
      approvedBy.push(r.user!.login);
    } else if (r.state === "CHANGES_REQUESTED") {
      changes++;
      changesBy.push(r.user!.login);
    }
    if (!last || new Date(r.submitted_at) > new Date(last.submitted_at)) last = r;
  }
  return {
    approved,
    changesRequested: changes,
    approvedBy,
    changesRequestedBy: changesBy,
    lastReviewState: (last?.state as any) ?? null,
  };
}

// ─── Deploy detection ─────────────────────────────────────────────────────────

interface Deployment {
  id: number;
  sha: string;
  environment: string;
  ref: string;
  updated_at: string;
}
interface DeploymentStatus {
  state: "success" | "failure" | "pending" | "error" | "inactive" | "queued" | "in_progress";
  updated_at: string;
  log_url: string | null;
  target_url: string | null;
}

async function getLatestDeployment(
  owner: string,
  repo: string,
  env: string,
): Promise<{ sha: string; updatedAt: string; url?: string } | null> {
  const deps = await gh<Deployment[]>(
    `/repos/${owner}/${repo}/deployments?environment=${encodeURIComponent(env)}&per_page=10`,
  ).catch(() => [] as Deployment[]);
  for (const d of deps) {
    const statuses = await gh<DeploymentStatus[]>(
      `/repos/${owner}/${repo}/deployments/${d.id}/statuses?per_page=10`,
    ).catch(() => [] as DeploymentStatus[]);
    const ok = statuses.find((s) => s.state === "success");
    if (ok) return { sha: d.sha, updatedAt: ok.updated_at, url: ok.log_url || ok.target_url || undefined };
  }
  return null;
}

interface WorkflowsResp {
  workflows: { id: number; name: string; path: string; state: string }[];
}
interface WorkflowRunsResp {
  workflow_runs: {
    id: number;
    name: string;
    head_sha: string;
    head_branch: string;
    status: string;
    conclusion: string | null;
    updated_at: string;
    html_url: string;
    event: string;
  }[];
}

export async function listRepoWorkflows(owner: string, repo: string) {
  const data = await gh<WorkflowsResp>(`/repos/${owner}/${repo}/actions/workflows?per_page=100`);
  return data.workflows;
}

const STAGING_RE = /(deploy.*stag|stag.*deploy|release.*stag|stag.*release|deploy.*dev|cd.*stag)/i;

export async function findDeployWorkflow(
  owner: string,
  repo: string,
  override?: string,
): Promise<DeployWorkflow | null> {
  const wfs = await listRepoWorkflows(owner, repo).catch(() => []);
  if (!wfs.length) return null;
  const match = override
    ? wfs.find((w) => w.path.endsWith(override) || w.name === override)
    : wfs.find((w) => STAGING_RE.test(w.name) || STAGING_RE.test(w.path));
  if (!match) return null;
  return { id: match.id, name: match.name, path: match.path };
}

interface RunInfo {
  branch: string;
  sha: string;
  updatedAt: string;
  url: string;
  status: string;
  conclusion: string | null;
}

// Latest run of a workflow (any branch). This is what reflects what's actually on staging right now.
async function getLatestRunAnyBranch(
  owner: string,
  repo: string,
  workflowId: number,
): Promise<RunInfo | null> {
  const runs = await gh<WorkflowRunsResp>(
    `/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?per_page=1`,
  ).catch(() => null);
  if (!runs || !runs.workflow_runs.length) return null;
  const r = runs.workflow_runs[0];
  return {
    branch: r.head_branch,
    sha: r.head_sha,
    updatedAt: r.updated_at,
    url: r.html_url,
    status: r.status,
    conclusion: r.conclusion,
  };
}

export async function detectDeployStatus(
  owner: string,
  repo: string,
  prHeadSha: string,
  defaultBranch: string,
  branch?: string,
  cfg?: { stagingEnvironment?: string; deployWorkflow?: string },
): Promise<{ status: DeployStatus; workflow: DeployWorkflow | null }> {
  const envCandidates = [cfg?.stagingEnvironment, "staging", "stage", "dev", "development"].filter(
    Boolean,
  ) as string[];
  let stagingHit: { sha: string; updatedAt: string; url?: string; branch?: string } | null = null;
  let prodHit: { sha: string; updatedAt: string; url?: string } | null = null;
  let method: DeployStatus["method"] = "unknown";
  let onStagingByBranch = false;
  let stagingBranchMatch = false;
  let stagingConclusion: DeployStatus["stagingConclusion"] = "none";

  const workflow = await findDeployWorkflow(owner, repo, cfg?.deployWorkflow);

  // 1) Deployments API: authoritative current staging SHA
  for (const e of envCandidates) {
    const dep = await getLatestDeployment(owner, repo, e);
    if (dep) {
      stagingHit = dep;
      method = "deployments-api";
      if (dep.sha === prHeadSha) {
        onStagingByBranch = true;
        stagingBranchMatch = true;
        stagingConclusion = "success";
      }
      break;
    }
  }

  // 2) Workflow runs: look at the *latest* run (any branch) of the staging workflow.
  // That's what's actually on staging right now. Only mark onStaging if that run
  // is for this PR's branch AND its head SHA matches the PR's head SHA.
  if (!stagingHit && workflow) {
    const latest = await getLatestRunAnyBranch(owner, repo, workflow.id);
    if (latest) {
      stagingHit = {
        sha: latest.sha,
        updatedAt: latest.updatedAt,
        url: latest.url,
        branch: latest.branch,
      };
      method = "workflow-run";

      const isThisBranch = !!branch && latest.branch === branch;
      stagingBranchMatch = isThisBranch;

      if (latest.status !== "completed") {
        // A deploy is in flight RIGHT NOW. Show its state only if it's for this branch.
        if (isThisBranch) {
          stagingConclusion = latest.status === "queued" ? "queued" : "in_progress";
        }
      } else if (latest.conclusion === "success") {
        if (isThisBranch && latest.sha === prHeadSha) {
          onStagingByBranch = true;
          stagingConclusion = "success";
        } else if (isThisBranch) {
          // This branch was deployed but PR has newer commits since.
          stagingConclusion = "success";
        }
      } else if (isThisBranch) {
        if (latest.conclusion === "failure") stagingConclusion = "failure";
        else if (latest.conclusion === "cancelled") stagingConclusion = "cancelled";
        else if (latest.conclusion === "timed_out") stagingConclusion = "timed_out";
        else stagingConclusion = "failure";
      }
    }
  }

  // Production / master state
  for (const e of ["production", "prod", "master", "main"]) {
    prodHit = await getLatestDeployment(owner, repo, e);
    if (prodHit) break;
  }
  if (!prodHit) {
    const commit = await gh<{ sha: string; commit: { author: { date: string } } }>(
      `/repos/${owner}/${repo}/commits/${defaultBranch}`,
    ).catch(() => null);
    if (commit) prodHit = { sha: commit.sha, updatedAt: commit.commit.author.date };
  }

  const status: DeployStatus = {
    onStaging: onStagingByBranch,
    onMaster: !!prodHit && prodHit.sha === prHeadSha,
    stagingSha: stagingHit?.sha,
    masterSha: prodHit?.sha,
    stagingRunUrl: stagingHit?.url,
    stagingUpdatedAt: stagingHit?.updatedAt,
    method,
    stagingBranchMatch,
    stagingConclusion,
    stagingBranch: stagingHit?.branch,
  };
  return { status, workflow };
}

export type RebaseOutcome =
  | { kind: "queued"; message: string }
  | { kind: "rebased"; newSha: string }
  | { kind: "conflict"; message: string }
  | { kind: "error"; message: string };

// Rebases the PR branch on top of its base branch via GitHub API.
// Note: GitHub's update-branch is asynchronous. We poll the PR for the new head SHA
// and the `mergeable_state` to detect conflicts.
export async function rebasePRBranch(
  owner: string,
  repo: string,
  num: number,
  expectedHeadSha: string,
): Promise<RebaseOutcome> {
  try {
    await gh(`/repos/${owner}/${repo}/pulls/${num}/update-branch`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expected_head_sha: expectedHeadSha, update_method: "rebase" }),
    });
  } catch (e) {
    const msg = (e as Error).message;
    // 422 with "merge conflict" indicates GitHub refused
    if (/conflict/i.test(msg)) return { kind: "conflict", message: msg };
    return { kind: "error", message: msg };
  }

  // Poll for completion. GitHub recomputes mergeability async; first poll often returns null.
  const maxAttempts = 12; // ~24s
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const pr = await getPRDetails(owner, repo, num).catch((): null => null);
    if (!pr) continue;
    if (pr.head.sha !== expectedHeadSha) {
      // Branch updated. Verify it's not in a dirty state.
      if (pr.mergeable === false && pr.mergeable_state === "dirty") {
        return { kind: "conflict", message: "rebase produced merge conflicts" };
      }
      return { kind: "rebased", newSha: pr.head.sha };
    }
    if (pr.mergeable_state === "dirty") {
      return { kind: "conflict", message: "branch has merge conflicts with base" };
    }
  }
  return { kind: "queued", message: "rebase queued; check the PR on GitHub" };
}

export async function postPRComment(
  owner: string,
  repo: string,
  num: number,
  body: string,
): Promise<{ html_url: string; id: number }> {
  return gh(`/repos/${owner}/${repo}/issues/${num}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
}

export async function dispatchWorkflow(
  owner: string,
  repo: string,
  workflowId: number,
  ref: string,
  inputs?: Record<string, string>,
): Promise<void> {
  await gh(`/repos/${owner}/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref, inputs }),
  });
}

export interface CommentEvent {
  id: number;
  prUrl: string;
  prTitle: string;
  repo: string;
  prNumber: number;
  author: string;
  authorAvatar: string;
  body: string;
  htmlUrl: string;
  createdAt: string;
  kind: "issue" | "review";
}

interface RawIssueComment {
  id: number;
  user: { login: string; avatar_url: string } | null;
  body: string;
  html_url: string;
  issue_url: string; // .../repos/owner/repo/issues/N
  created_at: string;
  updated_at: string;
}

interface RawReviewComment {
  id: number;
  user: { login: string; avatar_url: string } | null;
  body: string;
  html_url: string;
  pull_request_url: string;
  created_at: string;
  updated_at: string;
}

// Fetches recent comments across the user's authored repos using `since` for incremental polling.
// Uses two endpoints per repo: /issues/comments (covers PR conversation) and /pulls/comments (review threads).
export async function fetchRecentComments(
  prs: { repo: string; owner: string; name: string; number: number; title: string; html_url: string }[],
  sinceIso: string,
): Promise<CommentEvent[]> {
  const repos = Array.from(new Set(prs.map((p) => p.repo)));
  const byPrNum = new Map<string, { title: string; html_url: string }>();
  for (const p of prs) byPrNum.set(`${p.repo}#${p.number}`, { title: p.title, html_url: p.html_url });

  const events: CommentEvent[] = [];

  await Promise.all(
    repos.map(async (full) => {
      const [owner, name] = full.split("/");
      const since = encodeURIComponent(sinceIso);
      const [issueComments, reviewComments] = await Promise.all([
        gh<RawIssueComment[]>(
          `/repos/${owner}/${name}/issues/comments?since=${since}&sort=updated&direction=desc&per_page=50`,
        ).catch((): RawIssueComment[] => []),
        gh<RawReviewComment[]>(
          `/repos/${owner}/${name}/pulls/comments?since=${since}&sort=updated&direction=desc&per_page=50`,
        ).catch((): RawReviewComment[] => []),
      ]);

      for (const c of issueComments) {
        const n = Number(c.issue_url.split("/").pop());
        const key = `${full}#${n}`;
        const meta = byPrNum.get(key);
        if (!meta) continue; // not one of *our* PRs — skip
        events.push({
          id: c.id,
          prUrl: meta.html_url,
          prTitle: meta.title,
          repo: full,
          prNumber: n,
          author: c.user?.login ?? "ghost",
          authorAvatar: c.user?.avatar_url ?? "",
          body: c.body ?? "",
          htmlUrl: c.html_url,
          createdAt: c.created_at,
          kind: "issue",
        });
      }
      for (const c of reviewComments) {
        const n = Number(c.pull_request_url.split("/").pop());
        const key = `${full}#${n}`;
        const meta = byPrNum.get(key);
        if (!meta) continue;
        events.push({
          id: c.id,
          prUrl: meta.html_url,
          prTitle: meta.title,
          repo: full,
          prNumber: n,
          author: c.user?.login ?? "ghost",
          authorAvatar: c.user?.avatar_url ?? "",
          body: c.body ?? "",
          htmlUrl: c.html_url,
          createdAt: c.created_at,
          kind: "review",
        });
      }
    }),
  );

  events.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  return events;
}

export async function rateLimit(): Promise<{ remaining: number; limit: number; reset: number }> {
  const r = await gh<{ rate: { remaining: number; limit: number; reset: number } }>(`/rate_limit`);
  return r.rate;
}
