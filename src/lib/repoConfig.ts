// Per-repo overrides for staging deploy semantics + detection.
//
// Default behavior:
//   - Staging deploy = comment ".deploy staging" on the PR.
//   - Staging detection = compare PR's HEAD SHA against the latest deployment
//     in the staging environment, falling back to the most recent run of the
//     repo's deploy-staging workflow.
//
// Override for repos where this doesn't fit. Examples (uncomment and adapt):
//
//   "your-org/your-repo": {
//     // Staging serves any PR via a header (no single "active" branch).
//     stagingMode: "per-pr-header",
//     stagingNote: "any PR on staging via x-pr-env header",
//   },
//
//   "your-org/your-repo": {
//     // Deploy is a workflow_dispatch on master with inputs.
//     deployWorkflow: "deploy-staging.yml",
//     deployMode: "workflow_dispatch",
//     deployRef: "master",
//     deployInputs: (pr) => ({ branch: pr.branch, environment: "staging" }),
//   },
//
//   "your-org/your-repo": {
//     // Staging is deployed manually outside the dashboard.
//     disableStagingDeploy: true,
//     disableStagingReason: "deployed via internal CD pipeline",
//   },

export interface RepoConfig {
  stagingMode?: "branch" | "per-pr-header";
  stagingNote?: string; // shown on the card under the staging badge
  // Disables the staging deploy button on cards AND excludes from group deploy.
  disableStagingDeploy?: boolean;
  // Reason shown in the tooltip when the button is hidden.
  disableStagingReason?: string;
  // Override for the staging workflow file (e.g. "deploy-staging.yml").
  // Used both for detection ("is this branch deployed?") and for workflow_dispatch fallback.
  deployWorkflow?: string;
  // Override for the staging environment name in GitHub Deployments API.
  stagingEnvironment?: string;

  // How the staging deploy is triggered. Default: "comment".
  deployMode?: "comment" | "workflow_dispatch";
  // For workflow_dispatch: the ref to dispatch on (usually where the workflow file lives, e.g. "master").
  deployRef?: string;
  // For workflow_dispatch: inputs to send. Receives the PR's branch + head SHA.
  deployInputs?: (pr: { branch: string; sha: string }) => Record<string, string>;
}

const CONFIG: Record<string, RepoConfig> = {};

function loadUserOverrides(): Record<string, RepoConfig> {
  try {
    const s = JSON.parse(localStorage.getItem("gh_settings_v1") || "{}");
    const raw = (s.repoOverrides ?? {}) as Record<
      string,
      Omit<RepoConfig, "deployInputs"> & { deployInputs?: Record<string, string> }
    >;
    const out: Record<string, RepoConfig> = {};
    for (const [k, v] of Object.entries(raw)) {
      const { deployInputs, ...rest } = v;
      const cfg: RepoConfig = { ...rest };
      if (deployInputs) {
        cfg.deployInputs = (pr) => {
          const resolved: Record<string, string> = {};
          for (const [ik, iv] of Object.entries(deployInputs)) {
            resolved[ik] = String(iv)
              .replace(/\{branch\}/g, pr.branch)
              .replace(/\{sha\}/g, pr.sha);
          }
          return resolved;
        };
      }
      out[k.toLowerCase()] = cfg;
    }
    return out;
  } catch {
    return {};
  }
}

export function getRepoConfig(repo: string): RepoConfig {
  const key = repo.toLowerCase();
  const user = loadUserOverrides()[key];
  if (user) return user;
  return CONFIG[key] ?? {};
}
