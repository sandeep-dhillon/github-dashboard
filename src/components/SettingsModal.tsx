import { useState } from "react";
import {
  PR_REFRESH_OPTIONS,
  TIMELINE_OPTIONS,
  loadSettings,
  saveSettings,
  type Settings,
} from "../lib/settings";

const REPO_OVERRIDES_EXAMPLE = `{
  "your-org/your-frontend": {
    "stagingMode": "per-pr-header",
    "stagingNote": "any PR on staging via x-pr-env header"
  },
  "your-org/your-backend": {
    "deployWorkflow": "deploy-staging.yml",
    "deployMode": "workflow_dispatch",
    "deployRef": "master",
    "deployInputs": { "branch": "{branch}", "environment": "staging" }
  },
  "your-org/manual-deploy-app": {
    "disableStagingDeploy": true,
    "disableStagingReason": "deployed via internal CD pipeline"
  }
}`;

export function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState(loadSettings);
  const [repoJson, setRepoJson] = useState(() =>
    JSON.stringify(s.repoOverrides ?? {}, null, 2),
  );
  const [repoErr, setRepoErr] = useState("");

  const apiCostEstimate = () => {
    // Rough: 1 (search) + ~3 calls per PR per refresh; assume 15 PRs.
    const perPRRefresh = 1 + 3 * 15;
    const refreshesPerHour = s.prRefreshMs ? 3_600_000 / s.prRefreshMs : 0;
    const prCost = Math.round(perPRRefresh * refreshesPerHour);
    // Timeline: 2 calls per repo, ~6 repos.
    const timelineCost = Math.round((3_600_000 / s.timelinePollMs) * 12);
    return prCost + timelineCost;
  };

  const save = () => {
    setRepoErr("");
    let parsed: Record<string, unknown> = {};
    if (repoJson.trim()) {
      try {
        parsed = JSON.parse(repoJson);
        if (typeof parsed !== "object" || Array.isArray(parsed) || parsed === null) {
          throw new Error("must be an object keyed by owner/repo");
        }
      } catch (e) {
        setRepoErr((e as Error).message);
        return;
      }
    }
    saveSettings({ ...s, repoOverrides: parsed as Settings["repoOverrides"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-accent2 font-semibold">
              Settings
            </div>
            <h2 className="text-lg font-semibold mt-0.5">Auto-refresh intervals</h2>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md text-muted hover:text-text hover:bg-surface2 flex items-center justify-center text-lg"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-5 space-y-6">
          <Field
            title="PR data refresh"
            hint="How often to re-fetch PR checks, reviews, staging status. Off = manual refresh only."
          >
            <Pills
              options={PR_REFRESH_OPTIONS}
              value={s.prRefreshMs}
              onChange={(v) => setS({ ...s, prRefreshMs: v })}
            />
          </Field>

          <Field
            title="Comment timeline poll"
            hint="How often to check for new comments on your PRs."
          >
            <Pills
              options={TIMELINE_OPTIONS}
              value={s.timelinePollMs}
              onChange={(v) => setS({ ...s, timelinePollMs: v! })}
            />
          </Field>

          <Field
            title="GitHub organization filter"
            hint="Scopes PR search to one org. Leave empty for all orgs you can see."
          >
            <input
              type="text"
              placeholder="e.g. your-org"
              value={s.orgScope}
              onChange={(e) => setS({ ...s, orgScope: e.target.value })}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </Field>

          <Field
            title="API base URL"
            hint="For GitHub Enterprise Server. Default = https://api.github.com."
          >
            <input
              type="text"
              placeholder="https://api.github.com"
              value={s.apiBase}
              onChange={(e) => setS({ ...s, apiBase: e.target.value })}
              className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-accent"
            />
          </Field>

          <Field
            title="Per-repo overrides"
            hint='JSON keyed by "owner/repo". Use {branch} and {sha} placeholders inside deployInputs.'
          >
            <textarea
              value={repoJson}
              onChange={(e) => {
                setRepoJson(e.target.value);
                setRepoErr("");
              }}
              rows={10}
              spellCheck={false}
              placeholder={REPO_OVERRIDES_EXAMPLE}
              className={`w-full bg-surface2 border rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-accent ${
                repoErr ? "border-danger" : "border-border"
              }`}
            />
            <div className="flex items-center justify-between mt-1">
              {repoErr ? (
                <span className="text-[11px] text-danger">✕ {repoErr}</span>
              ) : (
                <span className="text-[11px] text-muted">
                  Empty {"{}"} clears all overrides.
                </span>
              )}
              <button
                type="button"
                onClick={() => setRepoJson(REPO_OVERRIDES_EXAMPLE)}
                className="text-[11px] text-accent2 hover:underline"
              >
                Insert example
              </button>
            </div>
          </Field>

          <div className="p-3 rounded-lg bg-surface2 border border-border">
            <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
              estimated api budget
            </div>
            <div className="text-sm font-mono">
              ~{apiCostEstimate().toLocaleString()} req/hr ·{" "}
              <span
                className={
                  apiCostEstimate() < 1000
                    ? "text-success"
                    : apiCostEstimate() < 3000
                      ? "text-warn"
                      : "text-danger"
                }
              >
                {Math.round((apiCostEstimate() / 5000) * 100)}% of 5,000/hr limit
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-bg overflow-hidden">
              <div
                className={`h-full ${
                  apiCostEstimate() < 1000
                    ? "bg-success"
                    : apiCostEstimate() < 3000
                      ? "bg-warn"
                      : "bg-danger"
                }`}
                style={{ width: `${Math.min(100, (apiCostEstimate() / 5000) * 100)}%` }}
              />
            </div>
          </div>
        </div>

        <div className="px-6 py-3 bg-surface2/50 border-t border-border flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface2"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="text-sm px-5 py-2 rounded-lg font-medium bg-gradient-to-r from-accent to-accent2 text-white hover:opacity-90 shadow"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="font-medium text-sm">{title}</div>
      <div className="text-xs text-muted mt-0.5">{hint}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Pills<T>({
  options,
  value,
  onChange,
}: {
  options: { label: string; value: T }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.label}
            onClick={() => onChange(o.value)}
            className={`text-xs px-3 py-1.5 rounded-md border transition ${
              active
                ? "bg-accent text-white border-accent"
                : "bg-surface2 text-muted border-border hover:text-text hover:border-muted"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
