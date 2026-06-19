import { useEffect, useState } from "react";
import {
  PR_REFRESH_OPTIONS,
  TIMELINE_OPTIONS,
  loadSettings,
  saveSettings,
  type Settings,
} from "../lib/settings";
import { loadKnownGroups, saveGroupOrder, loadGroupOrder } from "../lib/groups";

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
  }
}`;

type Tab = "general" | "priority" | "connection" | "repos";

const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: "general", label: "General", icon: "⚙" },
  { key: "priority", label: "Group priority", icon: "↕" },
  { key: "connection", label: "Connection", icon: "🔌" },
  { key: "repos", label: "Per-repo overrides", icon: "📦" },
];

export function SettingsModal({
  onClose,
  initialTab = "general",
  onPrioritySaved,
}: {
  onClose: () => void;
  initialTab?: Tab;
  onPrioritySaved?: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [s, setS] = useState(loadSettings);
  const [repoJson, setRepoJson] = useState(() =>
    JSON.stringify(s.repoOverrides ?? {}, null, 2),
  );
  const [repoErr, setRepoErr] = useState("");
  const [order, setOrder] = useState<string[]>(() => {
    const saved = loadGroupOrder();
    const known = loadKnownGroups();
    const merged = [...saved.filter((g) => known.includes(g))];
    for (const g of known) if (!merged.includes(g)) merged.push(g);
    return merged;
  });

  // Lock body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
        setTab("repos");
        return;
      }
    }
    saveSettings({ ...s, repoOverrides: parsed as Settings["repoOverrides"] });
    saveGroupOrder(order);
    onPrioritySaved?.();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl h-[min(640px,90vh)] bg-surface border border-border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-3 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-widest text-accent2 font-semibold">
              Settings
            </span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md text-muted hover:text-text hover:bg-surface2 flex items-center justify-center text-lg"
          >
            ×
          </button>
        </div>

        {/* Body: sidebar + content */}
        <div className="flex-1 flex min-h-0">
          <nav className="w-48 shrink-0 border-r border-border bg-surface2/40 py-3">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2.5 transition border-l-2 ${
                  tab === t.key
                    ? "border-accent bg-accent/10 text-text"
                    : "border-transparent text-muted hover:text-text hover:bg-surface/60"
                }`}
              >
                <span className="text-xs opacity-70">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>

          <div className="flex-1 overflow-y-auto px-6 py-5">
            {tab === "general" && (
              <GeneralTab s={s} setS={setS} />
            )}
            {tab === "priority" && (
              <PriorityTab order={order} setOrder={setOrder} />
            )}
            {tab === "connection" && (
              <ConnectionTab s={s} setS={setS} />
            )}
            {tab === "repos" && (
              <ReposTab
                json={repoJson}
                setJson={setRepoJson}
                err={repoErr}
                clearErr={() => setRepoErr("")}
              />
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-surface2/50 border-t border-border flex justify-end gap-2 shrink-0">
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

function GeneralTab({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  return (
    <div className="space-y-6">
      <Field
        title="PR data refresh"
        hint="How often to re-fetch checks, reviews, staging status. Off = manual refresh only."
      >
        <Pills
          options={PR_REFRESH_OPTIONS}
          value={s.prRefreshMs}
          onChange={(v) => setS({ ...s, prRefreshMs: v })}
        />
      </Field>

      <Field title="Comment timeline poll" hint="How often to check for new PR comments.">
        <Pills
          options={TIMELINE_OPTIONS}
          value={s.timelinePollMs}
          onChange={(v) => setS({ ...s, timelinePollMs: v! })}
        />
      </Field>

      <ApiBudget s={s} />
    </div>
  );
}

function PriorityTab({
  order,
  setOrder,
}: {
  order: string[];
  setOrder: (o: string[]) => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };

  if (order.length === 0) {
    return (
      <div className="text-center py-16 text-muted text-sm">
        <div className="text-3xl mb-2">📭</div>
        No groups yet. Create some from the ⋯ menu on a PR card.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-muted mb-4">
        Drag a row, or use the arrows. Top = highest priority.
      </p>
      <ul className="space-y-1.5">
        {order.map((name, i) => {
          const isDragging = dragIdx === i;
          const isOver = overIdx === i && dragIdx !== i;
          return (
            <li
              key={name}
              draggable
              onDragStart={(e) => {
                setDragIdx(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setOverIdx(i);
              }}
              onDragLeave={() => setOverIdx((v) => (v === i ? null : v))}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIdx !== null) move(dragIdx, i);
                setDragIdx(null);
                setOverIdx(null);
              }}
              onDragEnd={() => {
                setDragIdx(null);
                setOverIdx(null);
              }}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border bg-surface2 transition ${
                isDragging ? "opacity-40 border-accent" : "border-border"
              } ${isOver ? "border-accent2 ring-2 ring-accent2/30" : ""}`}
            >
              <span className="text-muted text-lg cursor-grab active:cursor-grabbing select-none">⋮⋮</span>
              <span className="shrink-0 w-7 h-7 rounded-md bg-gradient-to-br from-accent to-accent2 text-white text-[11px] font-bold flex items-center justify-center">
                {i + 1}
              </span>
              <span className="flex-1 font-medium truncate">{name}</span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  title="Move up"
                  className="w-7 h-7 rounded-md border border-border bg-surface hover:bg-surface2 disabled:opacity-30 disabled:cursor-default"
                >
                  ▲
                </button>
                <button
                  onClick={() => move(i, i + 1)}
                  disabled={i === order.length - 1}
                  title="Move down"
                  className="w-7 h-7 rounded-md border border-border bg-surface hover:bg-surface2 disabled:opacity-30 disabled:cursor-default"
                >
                  ▼
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button
        onClick={() => setOrder([...order].sort((a, b) => a.localeCompare(b)))}
        className="mt-4 text-xs text-muted hover:text-accent2"
      >
        ↻ Sort A→Z
      </button>
    </div>
  );
}

function ConnectionTab({ s, setS }: { s: Settings; setS: (s: Settings) => void }) {
  return (
    <div className="space-y-6">
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
    </div>
  );
}

function ReposTab({
  json,
  setJson,
  err,
  clearErr,
}: {
  json: string;
  setJson: (v: string) => void;
  err: string;
  clearErr: () => void;
}) {
  return (
    <div>
      <p className="text-sm text-muted mb-3">
        JSON keyed by <code className="font-mono text-accent2">owner/repo</code>. Use{" "}
        <code className="font-mono text-accent2">{"{branch}"}</code> and{" "}
        <code className="font-mono text-accent2">{"{sha}"}</code> placeholders inside{" "}
        <code className="font-mono">deployInputs</code>.
      </p>
      <textarea
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          clearErr();
        }}
        rows={16}
        spellCheck={false}
        placeholder={REPO_OVERRIDES_EXAMPLE}
        className={`w-full bg-surface2 border rounded-lg px-3 py-2 font-mono text-xs focus:outline-none focus:border-accent ${
          err ? "border-danger" : "border-border"
        }`}
      />
      <div className="flex items-center justify-between mt-2">
        {err ? (
          <span className="text-[11px] text-danger">✕ {err}</span>
        ) : (
          <span className="text-[11px] text-muted">
            Empty {"{}"} clears all overrides.
          </span>
        )}
        <button
          type="button"
          onClick={() => setJson(REPO_OVERRIDES_EXAMPLE)}
          className="text-[11px] text-accent2 hover:underline"
        >
          Insert example
        </button>
      </div>
    </div>
  );
}

function ApiBudget({ s }: { s: Settings }) {
  const perPR = 1 + 3 * 15;
  const refreshes = s.prRefreshMs ? 3_600_000 / s.prRefreshMs : 0;
  const prCost = Math.round(perPR * refreshes);
  const timelineCost = Math.round((3_600_000 / s.timelinePollMs) * 12);
  const total = prCost + timelineCost;
  const pct = Math.min(100, (total / 5000) * 100);
  const tone =
    total < 1000 ? "bg-success" : total < 3000 ? "bg-warn" : "bg-danger";
  const textTone =
    total < 1000 ? "text-success" : total < 3000 ? "text-warn" : "text-danger";
  return (
    <div className="p-3 rounded-lg bg-surface2 border border-border">
      <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
        estimated api budget
      </div>
      <div className="text-sm font-mono">
        ~{total.toLocaleString()} req/hr ·{" "}
        <span className={textTone}>{Math.round(pct)}% of 5,000/hr</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-bg overflow-hidden">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Field({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
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
