import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getToken,
  whoami,
  searchMyOpenPRs,
  searchPRs,
  getPRDetails,
  getCombinedChecks,
  getReviews,
  detectDeployStatus,
  rateLimit,
  checkTokenScopes,
  redactSecrets,
} from "./api/github";
import { _enrichSearchItem, groupByRepo, featureKeyFromTitle } from "./lib/feature";
import { useTheme } from "./lib/theme";
import { getRepoConfig } from "./lib/repoConfig";
import {
  loadOverrides,
  loadKnownGroups,
  addKnownGroup,
  groupPRs,
  renameGroup as renameGroupOverrides,
  setPRGroup,
  sortByOrder,
  UNGROUPED,
  type Overrides,
} from "./lib/groups";
import type { EnrichedPR } from "./types";
import { TokenGate } from "./components/TokenGate";
import { Header, type Stats } from "./components/Header";
import { GroupSection } from "./components/GroupSection";
import { PRCard } from "./components/PRCard";
import { CommentTimeline } from "./components/CommentTimeline";
import { Welcome, hasSeenWelcome } from "./components/Welcome";
import { SettingsModal } from "./components/SettingsModal";
import { PriorityManager } from "./components/PriorityManager";
import { useSettings } from "./lib/settings";

type View = "flat" | "feature" | "repo";

export default function App() {
  const [theme, setTheme] = useTheme();
  const [ready, setReady] = useState(!!getToken());
  const [me, setMe] = useState<{ login: string; avatar_url: string; name: string } | null>(null);
  const [prs, setPrs] = useState<EnrichedPR[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<View>("feature");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rate, setRate] = useState<{ remaining: number; limit: number; reset: number } | undefined>();
  const [customQuery, setCustomQuery] = useState<string>(localStorage.getItem("gh_query") || "");
  const [scopes, setScopes] = useState<string[]>([]);
  const [queryUsed, setQueryUsed] = useState<string>("");
  const [overrides, setOverrides] = useState<Overrides>(() => loadOverrides());
  const [knownGroups, setKnownGroups] = useState<string[]>(() => loadKnownGroups());
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(() => !hasSeenWelcome());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [priorityOpen, setPriorityOpen] = useState(false);
  const [settings] = useSettings();

  useEffect(() => {
    const onOpen = () => setSettingsOpen(true);
    const onPriority = () => setPriorityOpen(true);
    window.addEventListener("gh-open-settings", onOpen);
    window.addEventListener("gh-open-priority", onPriority);
    return () => {
      window.removeEventListener("gh-open-settings", onOpen);
      window.removeEventListener("gh-open-priority", onPriority);
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [user, scopesInfo] = await Promise.all([whoami(), checkTokenScopes().catch(() => ({ scopes: [] as string[], login: "" }))]);
      setMe(user);
      setScopes(scopesInfo.scopes);
      let items: any[];
      let qUsed: string;
      if (customQuery.trim()) {
        qUsed = customQuery.trim();
        items = await searchPRs(qUsed);
      } else {
        const res = await searchMyOpenPRs(user.login);
        items = res.items;
        qUsed = res.queryUsed;
      }
      setQueryUsed(qUsed);
      // Initial enrichment with just search data
      const initial: EnrichedPR[] = items.map((it) => ({
        ..._enrichSearchItem(it),
        loading: true,
      }));
      setPrs(initial);

      // Enrich each PR with details/checks/reviews/deploy in parallel (bounded)
      const queue = [...initial];
      const concurrency = 5;
      const updates: EnrichedPR[] = [...initial];
      await Promise.all(
        Array.from({ length: concurrency }).map(async () => {
          while (queue.length) {
            const pr = queue.shift()!;
            const idx = updates.findIndex((p) => p.item.id === pr.item.id);
            try {
              const details = await getPRDetails(pr.owner, pr.name, pr.item.number);
              const [checks, reviews, deployRes] = await Promise.all([
                getCombinedChecks(pr.owner, pr.name, details.head.sha).catch((): undefined => undefined),
                getReviews(pr.owner, pr.name, pr.item.number).catch((): undefined => undefined),
                detectDeployStatus(
                  pr.owner,
                  pr.name,
                  details.head.sha,
                  details.head.repo.default_branch,
                  details.head.ref,
                  {
                    deployWorkflow: getRepoConfig(pr.repo).deployWorkflow,
                    stagingEnvironment: getRepoConfig(pr.repo).stagingEnvironment,
                  },
                ).catch(() => ({ status: undefined, workflow: null })),
              ]);
              updates[idx] = {
                ...pr,
                details,
                checks,
                reviews,
                deploy: (deployRes as any).status,
                deployWorkflow: (deployRes as any).workflow,
                featureKey: featureKeyFromTitle(pr.item.title, details.head.ref),
                loading: false,
              };
            } catch (e) {
              updates[idx] = { ...pr, loading: false, error: redactSecrets((e as Error).message) };
            }
            setPrs([...updates]);
          }
        }),
      );
      try {
        setRate(await rateLimit());
      } catch {}
    } catch (e) {
      setError(redactSecrets((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (ready) refresh();
  }, [ready, refresh]);

  useEffect(() => {
    if (!ready || !settings.prRefreshMs) return;
    const id = setInterval(() => refresh(), settings.prRefreshMs);
    return () => clearInterval(id);
  }, [ready, settings.prRefreshMs, refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prs;
    return prs.filter((p) =>
      [p.item.title, p.repo, p.details?.head.ref ?? "", p.featureKey]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [prs, query]);

  const stats: Stats = useMemo(
    () => ({
      total: prs.length,
      approved: prs.filter((p) => (p.reviews?.approved ?? 0) > 0).length,
      failing: prs.filter((p) => p.checks?.state === "failure").length,
      pending: prs.filter((p) => p.checks?.state === "pending").length,
      onStaging: prs.filter((p) => p.deploy?.onStaging).length,
      draft: prs.filter((p) => p.item.draft).length,
    }),
    [prs],
  );

  if (!ready) return <TokenGate onReady={() => setReady(true)} />;

  return (
    <div className="min-h-screen">
      {welcomeOpen && <Welcome onClose={() => setWelcomeOpen(false)} />}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {priorityOpen && (
        <PriorityManager
          groups={Array.from(new Set([...knownGroups]))}
          onClose={() => setPriorityOpen(false)}
          onApplied={() => setKnownGroups([...knownGroups])}
        />
      )}
      <Header
        me={me}
        stats={stats}
        view={view}
        setView={setView}
        query={query}
        setQuery={setQuery}
        onRefresh={refresh}
        refreshing={loading}
        rate={rate}
        theme={theme}
        setTheme={setTheme}
        groupCount={knownGroups.length}
      />

      <main className="max-w-7xl mx-auto px-6 py-6">
        {error && (
          <div className="mb-4 p-4 bg-danger/10 border border-danger/30 rounded-lg text-danger text-sm">
            {error}
          </div>
        )}


        {loading && prs.length === 0 && (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-32 rounded-xl skeleton animate-shimmer" />
            ))}
          </div>
        )}

        {!loading && prs.length === 0 && !error && (
          <EmptyState
            login={me?.login}
            scopes={scopes}
            queryUsed={queryUsed}
            customQuery={customQuery}
            setCustomQuery={(v) => {
              setCustomQuery(v);
              localStorage.setItem("gh_query", v);
            }}
            onRetry={refresh}
          />
        )}

        {view === "flat" && (
          <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
            {filtered.map((pr) => (
              <PRCard key={pr.item.id} pr={pr} onAfterDeploy={refresh} />
            ))}
          </div>
        )}

        {view === "feature" && (
          <FeatureView
            prs={filtered}
            allPrs={prs}
            overrides={overrides}
            setOverrides={setOverrides}
            knownGroups={knownGroups}
            setKnownGroups={setKnownGroups}
            onAfterDeploy={refresh}
          />
        )}

        {view === "repo" && <RepoView prs={filtered} onAfterDeploy={refresh} />}
      </main>

      <CommentTimeline
        prs={prs}
        myLogin={me?.login ?? null}
        open={timelineOpen}
        setOpen={setTimelineOpen}
      />

      <footer className="max-w-7xl mx-auto px-6 py-10 text-xs text-muted">
        Built locally · auto-discovers all open PRs via GitHub Search API · staging detection via Deployments API + workflow runs.
      </footer>
    </div>
  );
}

function EmptyState({
  login,
  scopes,
  queryUsed,
  customQuery,
  setCustomQuery,
  onRetry,
}: {
  login?: string;
  scopes: string[];
  queryUsed: string;
  customQuery: string;
  setCustomQuery: (v: string) => void;
  onRetry: () => void;
}) {
  const hasRepo = scopes.includes("repo");
  const hasWorkflow = scopes.includes("workflow");
  const [draft, setDraft] = useState(customQuery);
  const suggestions = [
    `is:open is:pr author:${login ?? "@me"} archived:false`,
    `is:open is:pr involves:${login ?? "@me"}`,
    `is:open is:pr user:${login ?? "@me"}`,
    `is:open is:pr review-requested:${login ?? "@me"}`,
  ];
  return (
    <div className="bg-surface border border-border rounded-2xl p-8 max-w-3xl mx-auto">
      <div className="text-3xl mb-2">🔎</div>
      <h2 className="text-lg font-semibold mb-1">No PRs returned</h2>
      <p className="text-muted text-sm">
        Logged in as <span className="text-text font-mono">@{login}</span>. Query used:{" "}
        <code className="text-accent2 font-mono text-xs">{queryUsed}</code>
      </p>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <Check ok={!!login} label="Token authenticates" />
        <Check ok={hasRepo} label="Has `repo` scope (private + org PRs)" />
        <Check ok={hasWorkflow} label="Has `workflow` scope (deploy button)" />
        <Check ok={scopes.length > 0} label={`Scopes: ${scopes.join(", ") || "none reported"}`} />
      </div>

      {!hasRepo && (
        <div className="mt-4 p-3 bg-warn/10 border border-warn/30 rounded-lg text-warn text-sm">
          Token is missing the <code className="font-mono">repo</code> scope, so private and org PRs won't show up. Create a new token with{" "}
          <code className="font-mono">repo</code>, <code className="font-mono">workflow</code>, <code className="font-mono">read:user</code>.
          {" "}
          <a className="underline" target="_blank" rel="noreferrer" href="https://github.com/settings/tokens/new?scopes=repo,workflow,read:user&description=PR%20Dashboard">
            Create one
          </a>
          , then sign out (click avatar) and paste it again.
        </div>
      )}

      <div className="mt-6">
        <label className="text-xs uppercase tracking-wider text-muted">Custom search query</label>
        <div className="flex gap-2 mt-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. is:open is:pr org:your-org author:your-login"
            className="flex-1 bg-surface2 border border-border rounded-lg px-3 py-2 font-mono text-sm focus:outline-none focus:border-accent"
          />
          <button
            onClick={() => {
              setCustomQuery(draft);
              onRetry();
            }}
            className="bg-accent hover:bg-accent/90 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Run
          </button>
          {customQuery && (
            <button
              onClick={() => {
                setCustomQuery("");
                setDraft("");
                onRetry();
              }}
              className="bg-surface2 hover:bg-surface border border-border px-4 py-2 rounded-lg text-sm"
            >
              Reset
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => setDraft(s)}
              className="text-[11px] font-mono bg-surface2 hover:bg-surface border border-border px-2 py-1 rounded"
            >
              {s}
            </button>
          ))}
        </div>
        <a
          className="block mt-3 text-xs text-accent2 hover:underline"
          target="_blank"
          rel="noreferrer"
          href="https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests"
        >
          → GitHub search syntax docs
        </a>
      </div>
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${ok ? "bg-success/20 text-success" : "bg-danger/20 text-danger"}`}>
        {ok ? "✓" : "✕"}
      </span>
      <span className="text-sm">{label}</span>
    </div>
  );
}

function FeatureView({
  prs,
  allPrs,
  overrides,
  setOverrides,
  knownGroups,
  setKnownGroups,
  onAfterDeploy,
}: {
  prs: EnrichedPR[];
  allPrs: EnrichedPR[];
  overrides: Overrides;
  setOverrides: (o: Overrides) => void;
  knownGroups: string[];
  setKnownGroups: (g: string[]) => void;
  onAfterDeploy: () => void;
}) {
  const groups = groupPRs(prs, overrides);
  for (const g of knownGroups) if (!groups[g]) groups[g] = [];
  if (!groups[UNGROUPED]) groups[UNGROUPED] = [];

  const allGroupNames = Array.from(new Set([...knownGroups, ...Object.keys(groups)])).filter(
    (g) => g !== UNGROUPED,
  );

  // Priority-driven order. Ungrouped always last.
  const ordered = sortByOrder(Object.keys(groups));
  const entries: [string, EnrichedPR[]][] = ordered.map((k) => [k, groups[k] ?? []]);

  const onRename = (from: string, to: string) => {
    const next = renameGroupOverrides(overrides, allPrs, from, to);
    setOverrides(next);
    setKnownGroups(addKnownGroup(to));
  };
  const onMovePR = (key: string, to: string | null) => {
    const next = setPRGroup(overrides, key, to);
    setOverrides(next);
    if (to) setKnownGroups(addKnownGroup(to));
  };

  const visible = entries.filter(
    ([k, list]) => k !== UNGROUPED || list.length > 0 || knownGroups.length === 0,
  );

  return (
    <>
      {visible.map(([key, list]) => (
        <GroupSection
          key={key}
          title={key}
          prs={list}
          editable={key !== UNGROUPED}
          onRename={onRename}
          onMovePR={onMovePR}
          knownGroups={allGroupNames}
          onAfterDeploy={onAfterDeploy}
          subtitle={list.length ? undefined : "empty — move PRs here from the ⋯ menu"}
          accent={key === UNGROUPED ? "#2a3142" : undefined}
        />
      ))}
    </>
  );
}

function RepoView({ prs, onAfterDeploy }: { prs: EnrichedPR[]; onAfterDeploy: () => void }) {
  const groups = groupByRepo(prs);
  const sorted = Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
  return (
    <>
      {sorted.map(([key, list]) => (
        <GroupSection key={key} title={key} prs={list} onAfterDeploy={onAfterDeploy} />
      ))}
    </>
  );
}
