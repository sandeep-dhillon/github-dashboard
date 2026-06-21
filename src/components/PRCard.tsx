import { useState } from "react";
import type { EnrichedPR } from "../types";
import { relativeTime } from "../lib/feature";
import { dispatchWorkflow, postPRComment, rebasePRBranch, redactSecrets, getBehindBy } from "../api/github";
import { useDialog } from "./Dialog";
import { getRepoConfig } from "../lib/repoConfig";

const DEPLOY_COMMAND_KEY = "gh_deploy_command";
const getDeployCommand = () =>
  localStorage.getItem(DEPLOY_COMMAND_KEY) || ".deploy staging";

function StatePill({ state }: { state: "open" | "closed" | "draft" }) {
  const map = {
    open: "bg-success/15 text-success border-success/30",
    closed: "bg-danger/15 text-danger border-danger/30",
    draft: "bg-muted/20 text-muted border-muted/30",
  } as const;
  return (
    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${map[state]}`}>
      {state}
    </span>
  );
}

function ChecksBadge({ pr }: { pr: EnrichedPR }) {
  if (!pr.checks) return <Skeleton w="w-20" />;
  const c = pr.checks;
  if (c.state === "none")
    return <span className="text-xs text-muted px-2 py-1 rounded bg-surface2">no checks</span>;
  const cfg = {
    success: { bg: "bg-success/15 text-success border-success/30", icon: "✓", txt: `${c.passing} passing` },
    failure: { bg: "bg-danger/15 text-danger border-danger/30", icon: "✕", txt: `${c.failing} failing` },
    pending: { bg: "bg-warn/15 text-warn border-warn/30 animate-pulse", icon: "◔", txt: `${c.pending} running` },
    neutral: { bg: "bg-muted/15 text-muted border-muted/30", icon: "•", txt: "neutral" },
  }[c.state]!;
  const node = (
    <span className={`text-xs px-2 py-1 rounded border inline-flex items-center gap-1.5 ${cfg.bg}`}>
      <span>{cfg.icon}</span> {cfg.txt}
    </span>
  );
  if (c.state === "failure" && c.failingChecks[0]?.url) {
    return (
      <a href={c.failingChecks[0].url} target="_blank" rel="noreferrer" title={c.failingChecks.map((f) => f.name).join("\n")}>
        {node}
      </a>
    );
  }
  return node;
}

function ReviewBadge({ pr }: { pr: EnrichedPR }) {
  if (!pr.reviews) return <Skeleton w="w-16" />;
  const r = pr.reviews;
  if (r.changesRequested > 0) {
    return (
      <span className="text-xs px-2 py-1 rounded border bg-danger/15 text-danger border-danger/30" title={r.changesRequestedBy.join(", ")}>
        ⤺ changes requested
      </span>
    );
  }
  if (r.approved > 0) {
    return (
      <span className="text-xs px-2 py-1 rounded border bg-success/15 text-success border-success/30" title={r.approvedBy.join(", ")}>
        ✓ {r.approved} approved
      </span>
    );
  }
  return <span className="text-xs px-2 py-1 rounded bg-surface2 text-muted">awaiting review</span>;
}

function StagingBadge({ pr }: { pr: EnrichedPR }) {
  const cfg = getRepoConfig(pr.repo);
  if (cfg.stagingMode === "per-pr-header") {
    return (
      <span
        className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-info/10 text-info border-info/30"
        title={cfg.stagingNote}
      >
        ● any-PR staging (header)
      </span>
    );
  }
  if (!pr.deploy) return <Skeleton w="w-32" />;
  const d = pr.deploy;
  const time = d.stagingUpdatedAt ? relativeTime(d.stagingUpdatedAt) : null;

  let cls = "bg-surface2 text-muted border-border";
  let label = "○ staging — not deployed";
  let animate = "";

  // Authoritative: only "ON STAGING" when the current deploy SHA equals this PR's SHA.
  if (d.onStaging) {
    cls = "bg-info/15 text-info border-info/30";
    label = `● ON STAGING${time ? " · " + time : ""}`;
  } else if (d.stagingBranchMatch) {
    // Most recent deploy WAS this branch, but it's no longer the head (PR moved forward,
    // or the deploy failed/cancelled).
    switch (d.stagingConclusion) {
      case "success":
        cls = "bg-warn/10 text-warn border-warn/30";
        label = `◔ stale on staging (push to redeploy)${time ? " · " + time : ""}`;
        break;
      case "failure":
        cls = "bg-danger/15 text-danger border-danger/40";
        label = `✕ STAGING DEPLOY FAILED${time ? " · " + time : ""}`;
        break;
      case "cancelled":
        cls = "bg-muted/15 text-muted border-muted/30";
        label = `⊘ staging cancelled${time ? " · " + time : ""}`;
        break;
      case "timed_out":
        cls = "bg-danger/15 text-danger border-danger/40";
        label = `⌛ staging timed out${time ? " · " + time : ""}`;
        break;
      case "in_progress":
        cls = "bg-warn/15 text-warn border-warn/40";
        animate = "animate-pulse";
        label = `◔ deploying to staging…${time ? " · " + time : ""}`;
        break;
      case "queued":
        cls = "bg-warn/10 text-warn border-warn/30";
        animate = "animate-pulse";
        label = `◔ queued${time ? " · " + time : ""}`;
        break;
      default:
        cls = "bg-surface2 text-muted border-border";
        label = "○ staging — not deployed";
    }
  } else if (d.stagingBranch) {
    // Some other branch owns staging.
    cls = "bg-warn/10 text-warn border-warn/30";
    label = `○ ${d.stagingBranch} on staging${time ? " · " + time : ""}`;
  }

  const node = (
    <span
      className={`text-[10px] uppercase tracking-wider px-2 py-1 rounded border ${cls} ${animate}`}
      title={
        d.stagingSha
          ? `staging @ ${d.stagingSha.slice(0, 7)} (${d.method})`
          : "no deployment info found"
      }
    >
      {label}
    </span>
  );
  return d.stagingRunUrl ? (
    <a href={d.stagingRunUrl} target="_blank" rel="noreferrer">{node}</a>
  ) : (
    node
  );
}

function MergeBadge({ pr }: { pr: EnrichedPR }) {
  if (!pr.details) return null;
  const ms = pr.details.mergeable_state;
  if (pr.details.mergeable === false || ms === "dirty") {
    return (
      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-danger/15 text-danger border-danger/40">
        ⚠ merge conflicts
      </span>
    );
  }
  if (ms === "behind") {
    return (
      <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-warn/15 text-warn border-warn/40">
        ⤓ behind {pr.details.base.ref}
      </span>
    );
  }
  return null;
}

function MasterBadge({ pr }: { pr: EnrichedPR }) {
  if (!pr.deploy) return null;
  if (!pr.deploy.onMaster) return null;
  return (
    <span className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-accent/20 text-accent border-accent/30">
      ● merged to master
    </span>
  );
}

function Skeleton({ w = "w-20" }: { w?: string }) {
  return <div className={`${w} h-5 rounded skeleton animate-shimmer`} />;
}

export function PRCard({
  pr,
  onAfterDeploy,
  onMove,
  knownGroups,
  currentGroup,
  deployFeedback,
}: {
  pr: EnrichedPR;
  onAfterDeploy: () => void;
  onMove?: (prKey: string, to: string | null) => void;
  knownGroups?: string[];
  currentGroup?: string;
  deployFeedback?: { state: "idle" | "posting" | "ok" | "err"; message?: string; commentUrl?: string };
}) {
  const [deploying, setDeploying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [deployMenu, setDeployMenu] = useState(false);
  const dialog = useDialog();

  const branch = pr.details?.head.ref ?? "";
  const stateLabel: "open" | "closed" | "draft" = pr.item.draft ? "draft" : pr.item.state;
  const wf = pr.deployWorkflow;
  const prKeyStr = `${pr.repo}#${pr.item.number}`;
  const deployCmd = getDeployCommand();
  const hasConflict =
    pr.details?.mergeable === false || pr.details?.mergeable_state === "dirty";

  const repoCfg = getRepoConfig(pr.repo);
  const isDispatchMode = repoCfg.deployMode === "workflow_dispatch" && !!wf;

  const ensureRebased = async (): Promise<boolean> => {
    if (!pr.details) return true;
    const ms = pr.details.mergeable_state;
    if (ms === "dirty" || pr.details.mergeable === false) {
      await dialog.alert({
        title: "Merge conflict",
        tone: "danger",
        message: `Cannot deploy ${pr.repo}#${pr.item.number}: branch has merge conflicts with ${pr.details.base.ref}.\n\nResolve locally:\n  git fetch origin\n  git checkout ${pr.details.head.ref}\n  git rebase origin/${pr.details.base.ref}\n  # resolve conflicts, then\n  git push --force-with-lease`,
      });
      return false;
    }
    const behindBy =
      ms === "behind"
        ? 1
        : await getBehindBy(pr.owner, pr.name, pr.details.base.ref, pr.details.head.sha);
    if (behindBy <= 0) return true;
    setMsg("Rebasing on " + pr.details.base.ref + "…");
    const out = await rebasePRBranch(pr.owner, pr.name, pr.item.number, pr.details.head.sha);
    if (out.kind === "conflict") {
      await dialog.alert({
        title: "Rebase conflict",
        tone: "danger",
        message: `Rebase produced conflicts on ${pr.repo}#${pr.item.number}.\n\nResolve locally:\n  git fetch origin\n  git checkout ${pr.details.head.ref}\n  git rebase origin/${pr.details.base.ref}\n  # resolve, then\n  git push --force-with-lease`,
      });
      setMsg(`✕ rebase conflicts — resolve locally`);
      return false;
    }
    if (out.kind === "error") {
      setMsg(`✕ rebase error: ${out.message}`);
      return false;
    }
    if (out.kind === "rebased") setMsg(`✓ rebased → ${out.newSha.slice(0, 7)}`);
    if (out.kind === "queued") setMsg(`⏳ rebase queued`);
    return true;
  };

  const deployViaComment = async () => {
    setDeployMenu(false);
    if (!pr.details) return;
    const cmd = await dialog.prompt({
      title: "Deploy via PR comment",
      message: "Comment to post (triggers deploy bot):",
      defaultValue: deployCmd,
      okText: "Post comment",
    });
    if (!cmd) return;
    localStorage.setItem(DEPLOY_COMMAND_KEY, cmd);
    setDeploying(true);
    setMsg(null);
    try {
      const ok = await ensureRebased();
      if (!ok) {
        setDeploying(false);
        return;
      }
      const res = await postPRComment(pr.owner, pr.name, pr.item.number, cmd);
      setMsg(`Commented "${cmd}" ✓`);
      window.open(res.html_url, "_blank", "noopener");
      setTimeout(onAfterDeploy, 4000);
    } catch (e) {
      setMsg(`Failed: ${redactSecrets((e as Error).message)}`);
    } finally {
      setDeploying(false);
    }
  };

  const rebaseOnly = async () => {
    setDeployMenu(false);
    setDeploying(true);
    setMsg(null);
    await ensureRebased();
    setDeploying(false);
    setTimeout(onAfterDeploy, 3000);
  };

  const deployViaWorkflow = async (skipConfirm = false) => {
    setDeployMenu(false);
    if (!wf || !pr.details) {
      setMsg("No workflow detected for this repo");
      return;
    }
    const cfg = getRepoConfig(pr.repo);
    const ref =
      cfg.deployRef ||
      pr.details.head.repo.default_branch ||
      branch ||
      "main";
    const inputs = cfg.deployInputs?.({ branch, sha: pr.details.head.sha });
    const summary = `Dispatch ${wf.path} on ref=${ref}${
      inputs ? `\nInputs:\n${Object.entries(inputs).map(([k, v]) => `  ${k}: ${v}`).join("\n")}` : ""
    }\n\nProceed?`;
    if (!skipConfirm) {
      const ok = await dialog.confirm({
        title: "Dispatch deploy workflow",
        message: summary,
        okText: "Dispatch",
      });
      if (!ok) return;
    }
    setDeploying(true);
    setMsg(null);
    try {
      const ok = await ensureRebased();
      if (!ok) {
        setDeploying(false);
        return;
      }
      await dispatchWorkflow(pr.owner, pr.name, wf.id, ref, inputs);
      setMsg("Dispatched ✓");
      setTimeout(onAfterDeploy, 4000);
    } catch (e) {
      setMsg(`Failed: ${redactSecrets((e as Error).message)}`);
    } finally {
      setDeploying(false);
    }
  };

  const moveTo = (g: string | null) => {
    setMenu(false);
    if (!onMove) return;
    onMove(prKeyStr, g);
  };

  const handleMoveNew = async () => {
    const v = await dialog.prompt({
      title: "Move to new group",
      message: "Group name:",
      placeholder: "e.g. release-jan-30",
      okText: "Move",
    });
    if (v && v.trim()) moveTo(v.trim());
  };

  return (
    <div
      className={`group bg-surface border rounded-xl p-4 hover:shadow-glow transition relative ${
        hasConflict
          ? "border-danger/60 ring-1 ring-danger/30"
          : "border-border hover:border-accent/50"
      }`}
    >
      {hasConflict && (
        <div className="-mx-4 -mt-4 mb-3 px-4 py-2 bg-danger/10 border-b border-danger/30 rounded-t-xl flex items-center gap-2 text-danger text-xs">
          <span className="text-base">⚠</span>
          <span className="font-semibold">Merge conflicts with {pr.details?.base.ref}</span>
          <span className="text-muted">— resolve locally before deploying</span>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <StatePill state={stateLabel} />
            <a
              href={`https://github.com/${pr.repo}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted font-mono hover:text-accent2"
            >
              {pr.repo}
            </a>
            <span className="text-xs text-muted">#{pr.item.number}</span>
            <span className="text-xs text-muted">· {relativeTime(pr.item.updated_at)}</span>
          </div>
          <a
            href={pr.item.html_url}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-[15px] leading-snug hover:text-accent2 transition line-clamp-2"
          >
            {pr.item.title}
          </a>
          {branch && (
            <div className="mt-1 text-xs text-muted font-mono truncate">
              ⎇ {branch} → {pr.details?.base.ref}
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-1.5 shrink-0 relative">
          {getRepoConfig(pr.repo).disableStagingDeploy ? (
            <span
              className="text-[10px] uppercase tracking-wider px-2 py-1 rounded border bg-surface2 text-muted border-border whitespace-nowrap"
              title={getRepoConfig(pr.repo).disableStagingReason ?? "Staging deploy disabled for this repo"}
            >
              manual deploy
            </span>
          ) : (
            <div className="flex items-stretch shadow rounded-lg overflow-hidden">
              <button
                disabled={deploying}
                onClick={() => (isDispatchMode ? deployViaWorkflow() : deployViaComment())}
                title={
                  isDispatchMode
                    ? `Dispatch ${wf?.path} (ref=${repoCfg.deployRef ?? "default"})`
                    : `Post "${deployCmd}" as a PR comment`
                }
                className={`text-xs px-3 py-2 font-medium transition whitespace-nowrap ${
                  deploying ? "bg-accent/40 text-text" : "bg-accent hover:bg-accent/90 text-white"
                }`}
              >
                {deploying ? "Deploying…" : "⚡ Deploy staging"}
              </button>
              <button
                disabled={deploying}
                onClick={() => setDeployMenu((v) => !v)}
                className="text-xs px-2 bg-accent hover:bg-accent/90 text-white border-l border-white/20"
                title="Deploy options"
              >
                ▾
              </button>
            </div>
          )}
          {deployMenu && (
            <div className="absolute right-0 top-12 w-64 bg-surface2 border border-border rounded-lg shadow-2xl z-30 py-1 text-sm">
              <div className="px-3 py-1.5 text-[10px] uppercase text-muted">Deploy via</div>
              <button onClick={deployViaComment} className="w-full text-left px-3 py-2 hover:bg-surface text-xs">
                <div className="font-medium">Comment <code className="text-accent2">{deployCmd}</code></div>
                <div className="text-muted text-[10px]">Posts a comment on the PR (default for PF)</div>
              </button>
              <button
                onClick={() => deployViaWorkflow()}
                disabled={!wf}
                className="w-full text-left px-3 py-2 hover:bg-surface text-xs disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="font-medium">workflow_dispatch</div>
                <div className="text-muted text-[10px] truncate">
                  {wf ? wf.path : "no deploy workflow detected"}
                </div>
              </button>
              <div className="border-t border-border my-1" />
              <button onClick={rebaseOnly} className="w-full text-left px-3 py-2 hover:bg-surface text-xs">
                <div className="font-medium">↻ Rebase on {pr.details?.base.ref ?? "base"}</div>
                <div className="text-muted text-[10px]">Calls GitHub update-branch with rebase</div>
              </button>
            </div>
          )}

          {onMove && (
            <div className="relative">
              <button
                onClick={() => setMenu((v) => !v)}
                className="w-8 h-8 rounded-md text-muted hover:text-text hover:bg-surface2 transition flex items-center justify-center text-lg leading-none border border-border"
                title="Group options"
              >
                ⋯
              </button>
              {menu && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMenu(false)} />
                  <div className="absolute right-0 mt-1 w-56 bg-surface2 border border-border rounded-lg shadow-2xl z-30 py-1 text-sm">
                    <div className="px-3 py-1.5 text-[10px] uppercase text-muted tracking-wider">
                      Move to group
                    </div>
                    {(knownGroups ?? []).filter((g) => g !== currentGroup).length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted italic">No groups yet — create one below</div>
                    )}
                    {(knownGroups ?? []).filter((g) => g !== currentGroup).map((g) => (
                      <button
                        key={g}
                        onClick={() => moveTo(g)}
                        className="w-full text-left px-3 py-1.5 hover:bg-surface text-xs flex items-center gap-2"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" /> {g}
                      </button>
                    ))}
                    <div className="border-t border-border my-1" />
                    <button
                      onClick={handleMoveNew}
                      className="w-full text-left px-3 py-2 hover:bg-surface text-xs text-accent2 font-medium"
                    >
                      + Create new group
                    </button>
                    {currentGroup && currentGroup !== "Ungrouped" && (
                      <button
                        onClick={() => moveTo(null)}
                        className="w-full text-left px-3 py-1.5 hover:bg-surface text-xs text-muted"
                      >
                        Remove from group
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mt-3">
        <ChecksBadge pr={pr} />
        <ReviewBadge pr={pr} />
        <MergeBadge pr={pr} />
        <StagingBadge pr={pr} />
        <MasterBadge pr={pr} />
        {pr.details && (
          <span className="text-xs text-muted">
            +{pr.details.additions} <span className="text-success">▲</span>{" "}
            -{pr.details.deletions} <span className="text-danger">▼</span> ·{" "}
            {pr.details.changed_files} files
          </span>
        )}
        {pr.item.labels.slice(0, 3).map((l) => (
          <span
            key={l.name}
            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: `#${l.color}22`, color: `#${l.color}`, border: `1px solid #${l.color}55` }}
          >
            {l.name}
          </span>
        ))}
      </div>

      {pr.details && (
        <div className="mt-2 text-[11px] text-muted font-mono truncate">
          {isDispatchMode ? (
            <>
              dispatches <span className="text-accent2">{wf?.path?.replace(/^.*\//, "")}</span>
              {repoCfg.deployRef && <> on <span className="text-accent2">{repoCfg.deployRef}</span></>}
            </>
          ) : (
            <>
              deploys by commenting <span className="text-accent2">{deployCmd}</span> on PR
            </>
          )}
          {repoCfg.stagingNote && (
            <span className="text-info">
              {" "}· {repoCfg.stagingNote}
            </span>
          )}
        </div>
      )}
      {msg && <div className="mt-2 text-xs text-accent2">{msg}</div>}

      {deployFeedback && (
        <div
          className={`mt-2 text-xs flex items-center gap-2 ${
            deployFeedback.state === "ok"
              ? "text-success"
              : deployFeedback.state === "err"
                ? "text-danger"
                : "text-warn"
          }`}
        >
          {deployFeedback.state === "posting" && <span className="animate-pulse">◔ posting…</span>}
          {deployFeedback.state === "ok" && (
            <>
              <span>✓ deploy comment posted</span>
              {deployFeedback.commentUrl && (
                <a className="underline" href={deployFeedback.commentUrl} target="_blank" rel="noreferrer">
                  open
                </a>
              )}
            </>
          )}
          {deployFeedback.state === "err" && (
            <span className="truncate">✕ {redactSecrets(deployFeedback.message ?? "failed")}</span>
          )}
        </div>
      )}
    </div>
  );
}
