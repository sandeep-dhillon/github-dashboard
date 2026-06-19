import { useRef, useState } from "react";
import { clearToken, setToken } from "../api/github";
import type { Theme } from "../lib/theme";

export interface Stats {
  total: number;
  approved: number;
  failing: number;
  pending: number;
  onStaging: number;
  draft: number;
}

export function Header({
  me,
  stats,
  view,
  setView,
  query,
  setQuery,
  onRefresh,
  refreshing,
  rate,
  theme,
  setTheme,
  groupCount = 0,
}: {
  me: { login: string; avatar_url: string; name: string } | null;
  stats: Stats;
  view: "flat" | "feature" | "repo";
  setView: (v: "flat" | "feature" | "repo") => void;
  query: string;
  setQuery: (q: string) => void;
  onRefresh: () => void;
  refreshing: boolean;
  rate?: { remaining: number; limit: number; reset: number };
  theme: Theme;
  setTheme: (t: Theme) => void;
  groupCount?: number;
}) {
  return (
    <header className="sticky top-0 z-20 backdrop-blur-xl bg-bg/75 border-b border-border">
      <div className="max-w-7xl mx-auto px-6 py-3">
        {/* Row 1: brand + actions */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-extrabold text-white text-sm shrink-0">
            PR
          </div>
          <div className="min-w-0">
            <div className="font-semibold leading-tight whitespace-nowrap">PR Dashboard</div>
            <div className="text-[11px] text-muted leading-tight font-mono truncate">
              {me?.login ? `@${me.login}` : ""}
              {rate && <RateChip rate={rate} />}
            </div>
          </div>

          <div className="flex-1" />

          <input
            className="bg-surface2 border border-border rounded-lg px-3 py-2 text-sm w-48 lg:w-72 focus:outline-none focus:border-accent"
            placeholder="Search title, repo, branch…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          {view === "feature" && groupCount >= 2 && (
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("gh-open-priority"))}
              title="Manage group priority"
              className="text-sm bg-surface2 hover:bg-surface border border-border px-3 h-9 rounded-lg shrink-0 flex items-center gap-1.5"
            >
              ↕ <span className="hidden lg:inline text-xs">Priority</span>
            </button>
          )}

          <div className="flex items-center bg-surface2 border border-border rounded-lg p-0.5 text-sm shrink-0">
            {(["flat", "feature", "repo"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 rounded-md transition ${
                  view === v ? "bg-accent text-white" : "text-muted hover:text-text"
                }`}
              >
                {v === "flat" ? "All" : v === "feature" ? "Feature" : "Repo"}
              </button>
            ))}
          </div>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            className="text-sm bg-surface2 hover:bg-surface border border-border w-9 h-9 rounded-lg shrink-0 flex items-center justify-center"
          >
            {theme === "dark" ? "☾" : "☀"}
          </button>

          <button
            onClick={onRefresh}
            disabled={refreshing}
            title="Refresh"
            className={`text-sm bg-surface2 hover:bg-surface border border-border w-9 h-9 rounded-lg disabled:opacity-50 shrink-0 flex items-center justify-center ${refreshing ? "animate-spin" : ""}`}
          >
            ↻
          </button>

          {me?.avatar_url && <ProfileMenu me={me} />}
        </div>

        {/* Row 2: stats strip */}
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <StatPill label="Open" v={stats.total} tone="default" />
          <StatPill label="Approved" v={stats.approved} tone="success" />
          <StatPill label="Failing" v={stats.failing} tone="danger" />
          <StatPill label="Running" v={stats.pending} tone="warn" />
          <StatPill label="On staging" v={stats.onStaging} tone="info" />
          <StatPill label="Draft" v={stats.draft} tone="muted" />
        </div>
      </div>
    </header>
  );
}

function RateChip({ rate }: { rate: { remaining: number; limit: number; reset: number } }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const used = rate.limit - rate.remaining;
  const pct = Math.round((rate.remaining / rate.limit) * 100);
  const resetIn = Math.max(0, rate.reset * 1000 - Date.now());
  const mins = Math.floor(resetIn / 60_000);
  const secs = Math.floor((resetIn % 60_000) / 1000);
  const resetWhen = new Date(rate.reset * 1000).toLocaleTimeString();
  const tone =
    rate.remaining < rate.limit * 0.1
      ? "text-danger"
      : rate.remaining < rate.limit * 0.25
        ? "text-warn"
        : "text-muted";

  const showTooltip = () => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left });
    setHover(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={showTooltip}
        onMouseLeave={() => setHover(false)}
        className={`ml-2 ${tone}`}
      >
        · {rate.remaining}/{rate.limit}
      </span>
      {hover && pos && (
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left }}
          className="z-50 w-72 p-3 rounded-lg bg-surface2 border border-border shadow-2xl text-[11px] font-sans normal-case tracking-normal pointer-events-none"
        >
          <div className="font-semibold text-text mb-1">GitHub API rate limit</div>
          <div className="space-y-0.5 text-muted">
            <div>{rate.remaining.toLocaleString()} requests remaining ({pct}%)</div>
            <div>{used.toLocaleString()} used of {rate.limit.toLocaleString()} this hour</div>
            <div>Resets in {mins}m {secs}s · {resetWhen}</div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-bg overflow-hidden">
            <div
              className={`h-full transition-all ${
                rate.remaining < rate.limit * 0.1
                  ? "bg-danger"
                  : rate.remaining < rate.limit * 0.25
                    ? "bg-warn"
                    : "bg-gradient-to-r from-accent to-accent2"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 text-[10px] text-muted/80">
            Each PR refresh uses ~3 calls + 2 per repo. Comment timeline polls per your Settings.
          </div>
        </div>
      )}
    </>
  );
}

function ProfileMenu({ me }: { me: { login: string; avatar_url: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [tokenForm, setTokenForm] = useState(false);
  const [tokenDraft, setTokenDraft] = useState("");

  const submitToken = () => {
    const t = tokenDraft.trim();
    if (!t) return;
    setToken(t);
    setTokenDraft("");
    setTokenForm(false);
    setOpen(false);
    location.reload();
  };

  const signOut = () => {
    setOpen(false);
    if (confirm("Sign out and forget the current token?")) {
      clearToken();
      location.reload();
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        title={`@${me.login}`}
        className="block"
      >
        <img src={me.avatar_url} className="w-9 h-9 rounded-full border border-border hover:ring-2 hover:ring-accent transition" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-64 bg-surface2 border border-border rounded-lg shadow-2xl z-40 py-1 text-sm">
            <div className="px-3 py-2 border-b border-border">
              <div className="font-semibold">{me.name || me.login}</div>
              <div className="text-xs text-muted font-mono">@{me.login}</div>
            </div>
            <a
              href={`https://github.com/${me.login}`}
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 hover:bg-surface text-xs"
            >
              ↗ View profile on GitHub
            </a>
            <a
              href="https://github.com/settings/tokens"
              target="_blank"
              rel="noreferrer"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 hover:bg-surface text-xs"
            >
              ↗ Manage tokens
            </a>
            <button
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent("gh-open-settings"));
              }}
              className="w-full text-left px-3 py-2 hover:bg-surface text-xs"
            >
              ⚙ Settings
            </button>
            <div className="border-t border-border my-1" />
            {tokenForm ? (
              <div className="px-3 py-2 space-y-2">
                <label className="block text-[10px] uppercase text-muted tracking-wider">
                  New token (masked)
                </label>
                <input
                  type="password"
                  autoFocus
                  placeholder="ghp_… or github_pat_…"
                  value={tokenDraft}
                  onChange={(e) => setTokenDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitToken();
                    if (e.key === "Escape") {
                      setTokenForm(false);
                      setTokenDraft("");
                    }
                  }}
                  className="w-full bg-surface border border-border rounded px-2 py-1.5 font-mono text-xs focus:outline-none focus:border-accent"
                />
                <div className="flex gap-1">
                  <button
                    onClick={submitToken}
                    disabled={!tokenDraft.trim()}
                    className="flex-1 text-xs px-2 py-1.5 rounded bg-accent text-white disabled:opacity-50"
                  >
                    Save & reload
                  </button>
                  <button
                    onClick={() => {
                      setTokenForm(false);
                      setTokenDraft("");
                    }}
                    className="text-xs px-2 py-1.5 rounded bg-surface border border-border"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setTokenForm(true)}
                className="w-full text-left px-3 py-2 hover:bg-surface text-xs text-accent2 font-medium"
              >
                ↻ Use a different token
              </button>
            )}
            <button
              onClick={signOut}
              className="w-full text-left px-3 py-2 hover:bg-surface text-xs text-danger"
            >
              ⎋ Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function StatPill({
  label,
  v,
  tone,
}: {
  label: string;
  v: number;
  tone: "default" | "success" | "danger" | "warn" | "info" | "muted";
}) {
  const tones = {
    default: "bg-surface2 text-text border-border",
    success: "bg-success/10 text-success border-success/30",
    danger: "bg-danger/10 text-danger border-danger/30",
    warn: "bg-warn/10 text-warn border-warn/30",
    info: "bg-info/10 text-info border-info/30",
    muted: "bg-surface2 text-muted border-border",
  } as const;
  return (
    <span
      className={`inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-md border text-xs ${tones[tone]}`}
    >
      <span className="font-bold tabular-nums">{v}</span>
      <span className="opacity-80 uppercase tracking-wide text-[10px]">{label}</span>
    </span>
  );
}
