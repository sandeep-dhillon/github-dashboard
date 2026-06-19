import { useEffect, useState } from "react";

export interface SerializableRepoConfig {
  stagingMode?: "branch" | "per-pr-header";
  stagingNote?: string;
  disableStagingDeploy?: boolean;
  disableStagingReason?: string;
  deployWorkflow?: string;
  stagingEnvironment?: string;
  deployMode?: "comment" | "workflow_dispatch";
  deployRef?: string;
  // Values can contain {branch} and {sha} placeholders, e.g. { branch: "{branch}", environment: "staging" }
  deployInputs?: Record<string, string>;
}

export interface Settings {
  // PR data auto-refresh interval in ms. null = off.
  prRefreshMs: number | null;
  // Comment timeline poll interval in ms.
  timelinePollMs: number;
  // GitHub API base URL (api.github.com for public, https://github.acme.com/api/v3 for Enterprise).
  apiBase: string;
  // Optional org filter (e.g. "your-org") that scopes PR search. Empty = all orgs you can see.
  orgScope: string;
  // Per-repo overrides keyed by "owner/repo" (case-insensitive).
  repoOverrides: Record<string, SerializableRepoConfig>;
}

const KEY = "gh_settings_v1";

export const DEFAULT_SETTINGS: Settings = {
  prRefreshMs: null,
  timelinePollMs: 5 * 60_000,
  apiBase: "https://api.github.com",
  orgScope: "",
  repoOverrides: {},
};

export function loadSettings(): Settings {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULT_SETTINGS, ...raw };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent("gh-settings-changed"));
}

export function useSettings(): [Settings, (s: Settings) => void] {
  const [s, setS] = useState<Settings>(loadSettings);
  useEffect(() => {
    const onChange = () => setS(loadSettings());
    window.addEventListener("gh-settings-changed", onChange);
    return () => window.removeEventListener("gh-settings-changed", onChange);
  }, []);
  return [
    s,
    (next: Settings) => {
      saveSettings(next);
      setS(next);
    },
  ];
}

export const PR_REFRESH_OPTIONS: { label: string; value: number | null }[] = [
  { label: "Off", value: null },
  { label: "1 min", value: 60_000 },
  { label: "2 min", value: 120_000 },
  { label: "5 min", value: 300_000 },
  { label: "10 min", value: 600_000 },
  { label: "30 min", value: 1_800_000 },
];

export const TIMELINE_OPTIONS: { label: string; value: number }[] = [
  { label: "1 min", value: 60_000 },
  { label: "2 min", value: 120_000 },
  { label: "5 min", value: 300_000 },
  { label: "10 min", value: 600_000 },
  { label: "30 min", value: 1_800_000 },
];
