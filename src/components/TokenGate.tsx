import { useState } from "react";
import { setToken } from "../api/github";
import { loadSettings, saveSettings } from "../lib/settings";

export function TokenGate({ onReady }: { onReady: () => void }) {
  const existing = loadSettings();
  const [token, setT] = useState("");
  const [apiBase, setApiBase] = useState(existing.apiBase);
  const [orgScope, setOrgScope] = useState(existing.orgScope);
  const [advanced, setAdvanced] = useState(false);
  const [err, setErr] = useState("");

  const submit = () => {
    if (!token.trim()) {
      setErr("Token required");
      return;
    }
    const base = apiBase.trim().replace(/\/+$/, "") || "https://api.github.com";
    if (!/^https:\/\//.test(base)) {
      setErr("API base must start with https://");
      return;
    }
    saveSettings({ ...existing, apiBase: base, orgScope: orgScope.trim() });
    setToken(token.trim());
    onReady();
  };

  const isEnterprise = apiBase && apiBase !== "https://api.github.com";
  const tokenSettingsUrl = isEnterprise
    ? `${apiBase.replace(/\/api\/v3\/?$/, "")}/settings/tokens/new?scopes=repo,workflow,read:user&description=PR%20Dashboard`
    : "https://github.com/settings/tokens/new?scopes=repo,workflow,read:user&description=PR%20Dashboard";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl p-8 shadow-glow">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-accent to-accent2 flex items-center justify-center font-bold text-white">PR</div>
          <div>
            <h1 className="text-xl font-semibold">PR Dashboard</h1>
            <p className="text-muted text-sm">Connect your GitHub account</p>
          </div>
        </div>

        <p className="text-sm text-muted mt-4">
          Create a <span className="text-text">classic PAT</span> with scopes{" "}
          <code className="px-1.5 py-0.5 bg-surface2 rounded text-accent2 font-mono text-xs">repo</code>{" "}
          <code className="px-1.5 py-0.5 bg-surface2 rounded text-accent2 font-mono text-xs">workflow</code>{" "}
          <code className="px-1.5 py-0.5 bg-surface2 rounded text-accent2 font-mono text-xs">read:user</code>.
          Token stays in your browser — never sent anywhere except GitHub.
        </p>
        <a
          href={tokenSettingsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-3 text-accent2 text-sm hover:underline"
        >
          → Create token on {isEnterprise ? "your GitHub Enterprise" : "GitHub"}
        </a>

        <label className="block mt-6 text-[10px] uppercase tracking-wider text-muted">
          Personal access token
        </label>
        <input
          type="password"
          placeholder="ghp_… or github_pat_…"
          className="mt-1 w-full bg-surface2 border border-border rounded-lg px-4 py-3 font-mono text-sm focus:outline-none focus:border-accent"
          value={token}
          onChange={(e) => setT(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        <label className="block mt-4 text-[10px] uppercase tracking-wider text-muted">
          GitHub organization <span className="normal-case text-muted/70">(optional, filters PR list)</span>
        </label>
        <input
          type="text"
          placeholder="e.g. your-org"
          className="mt-1 w-full bg-surface2 border border-border rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-accent"
          value={orgScope}
          onChange={(e) => setOrgScope(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
        <p className="text-[11px] text-muted mt-1">
          Leave blank to see PRs across every org you have access to.
        </p>

        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="mt-4 text-xs text-muted hover:text-accent2"
        >
          {advanced ? "− Hide" : "+ Show"} advanced (GitHub Enterprise)
        </button>
        {advanced && (
          <>
            <label className="block mt-3 text-[10px] uppercase tracking-wider text-muted">
              API base URL
            </label>
            <input
              type="text"
              placeholder="https://api.github.com"
              className="mt-1 w-full bg-surface2 border border-border rounded-lg px-4 py-3 font-mono text-xs focus:outline-none focus:border-accent"
              value={apiBase}
              onChange={(e) => setApiBase(e.target.value)}
            />
            <p className="text-[11px] text-muted mt-1">
              For GitHub Enterprise Server use{" "}
              <code className="font-mono">https://github.acme.com/api/v3</code>.
            </p>
          </>
        )}

        {err && <p className="text-danger text-sm mt-3">{err}</p>}

        <button
          className="mt-5 w-full bg-accent hover:bg-accent/90 transition px-4 py-3 rounded-lg font-semibold text-white"
          onClick={submit}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
