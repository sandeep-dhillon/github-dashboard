import { useState } from "react";
import type { EnrichedPR } from "../types";
import { PRCard } from "./PRCard";
import { postPRComment, rebasePRBranch, redactSecrets, dispatchWorkflow } from "../api/github";
import { getRepoConfig } from "../lib/repoConfig";

type DeployState = "idle" | "posting" | "ok" | "err";
interface PerPR {
  state: DeployState;
  message?: string;
  commentUrl?: string;
}

export function GroupSection({
  title,
  prs,
  onAfterDeploy,
  onRename,
  onMovePR,
  knownGroups,
  accent,
  subtitle,
  editable = false,
}: {
  title: string;
  prs: EnrichedPR[];
  onAfterDeploy: () => void;
  onRename?: (from: string, to: string) => void;
  onMovePR?: (prKeyStr: string, to: string | null) => void;
  knownGroups?: string[];
  accent?: string;
  subtitle?: string;
  editable?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [groupDeploy, setGroupDeploy] = useState<Record<string, PerPR>>({});
  const [groupDeploying, setGroupDeploying] = useState(false);

  const failing = prs.filter((p) => p.checks?.state === "failure").length;
  const approved = prs.filter((p) => (p.reviews?.approved ?? 0) > 0).length;
  const onStaging = prs.filter((p) => p.deploy?.onStaging).length;

  const commit = () => {
    const v = draft.trim();
    setEditing(false);
    if (v && v !== title && onRename) onRename(title, v);
    else setDraft(title);
  };

  const deployablePrs = prs.filter((p) => !getRepoConfig(p.repo).disableStagingDeploy);
  const skippedPrs = prs.filter((p) => getRepoConfig(p.repo).disableStagingDeploy);

  const deployAll = async () => {
    if (!deployablePrs.length) return;
    const cmd =
      localStorage.getItem("gh_deploy_command") ||
      ".deploy staging";
    const skipNote = skippedPrs.length
      ? `\n\nSkipping ${skippedPrs.length} (manual deploy):\n${skippedPrs.map((p) => `• ${p.repo}#${p.item.number}`).join("\n")}`
      : "";
    const confirmed = confirm(
      `Post "${cmd}" as a comment on ${deployablePrs.length} PR${deployablePrs.length === 1 ? "" : "s"} in "${title}"?\n\n${deployablePrs.map((p) => `• ${p.repo}#${p.item.number}`).join("\n")}${skipNote}`,
    );
    if (!confirmed) return;
    setGroupDeploying(true);
    const init: Record<string, PerPR> = {};
    for (const pr of deployablePrs) init[`${pr.repo}#${pr.item.number}`] = { state: "posting" };
    setGroupDeploy(init);

    // Concurrency-limited posting; per-PR: rebase-if-behind, then comment.
    const concurrency = 3;
    const queue = [...deployablePrs];
    const results: Record<string, PerPR> = { ...init };
    const conflicts: string[] = [];
    await Promise.all(
      Array.from({ length: concurrency }).map(async () => {
        while (queue.length) {
          const pr = queue.shift()!;
          const k = `${pr.repo}#${pr.item.number}`;
          try {
            if (pr.details) {
              const ms = pr.details.mergeable_state;
              if (pr.details.mergeable === false || ms === "dirty") {
                results[k] = { state: "err", message: "merge conflicts — resolve locally" };
                conflicts.push(k);
                setGroupDeploy({ ...results });
                continue;
              }
              if (ms === "behind") {
                const out = await rebasePRBranch(pr.owner, pr.name, pr.item.number, pr.details.head.sha);
                if (out.kind === "conflict") {
                  results[k] = { state: "err", message: "rebase produced conflicts — resolve locally" };
                  conflicts.push(k);
                  setGroupDeploy({ ...results });
                  continue;
                }
                if (out.kind === "error") {
                  results[k] = { state: "err", message: `rebase failed: ${out.message}` };
                  setGroupDeploy({ ...results });
                  continue;
                }
              }
            }
            const repoCfg = getRepoConfig(pr.repo);
            if (repoCfg.deployMode === "workflow_dispatch" && pr.deployWorkflow && pr.details) {
              const ref =
                repoCfg.deployRef || pr.details.head.repo.default_branch || pr.details.head.ref;
              const inputs = repoCfg.deployInputs?.({
                branch: pr.details.head.ref,
                sha: pr.details.head.sha,
              });
              await dispatchWorkflow(pr.owner, pr.name, pr.deployWorkflow.id, ref, inputs);
              results[k] = { state: "ok" };
            } else {
              const res = await postPRComment(pr.owner, pr.name, pr.item.number, cmd);
              results[k] = { state: "ok", commentUrl: res.html_url };
            }
          } catch (e) {
            results[k] = { state: "err", message: redactSecrets((e as Error).message) };
          }
          setGroupDeploy({ ...results });
        }
      }),
    );
    if (conflicts.length) {
      alert(
        `${conflicts.length} PR${conflicts.length === 1 ? "" : "s"} in "${title}" need conflict resolution:\n\n${conflicts.join("\n")}\n\nResolve locally, push, and re-run the group deploy.`,
      );
    }
    setGroupDeploying(false);
    setTimeout(onAfterDeploy, 5000);
  };

  const states = Object.values(groupDeploy);
  const done = states.filter((s) => s.state === "ok" || s.state === "err").length;
  const okCount = states.filter((s) => s.state === "ok").length;
  const errCount = states.filter((s) => s.state === "err").length;
  const showProgress = states.length > 0;

  return (
    <section className="mb-6">
      <div className="w-full flex items-center gap-3 px-3 py-2 hover:bg-surface/60 rounded-lg transition group/header">
        <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-3 flex-1 min-w-0">
          <span
            className="w-1.5 h-6 rounded-full shrink-0"
            style={{ background: accent ?? "linear-gradient(180deg,#7c5cff,#22d3ee)" }}
          />
          {editing ? (
            <input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(title);
                  setEditing(false);
                }
              }}
              onBlur={commit}
              className="bg-surface2 border border-accent rounded px-2 py-0.5 font-semibold text-sm uppercase tracking-wider focus:outline-none"
            />
          ) : (
            <h2 className="font-semibold text-sm uppercase tracking-wider truncate">{title}</h2>
          )}
          <span className="text-xs text-muted shrink-0">{prs.length} PR{prs.length === 1 ? "" : "s"}</span>
          {subtitle && <span className="text-xs text-muted truncate hidden sm:inline">· {subtitle}</span>}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {failing > 0 && <span className="text-xs text-danger">{failing} failing</span>}
          {approved > 0 && <span className="text-xs text-success">{approved} approved</span>}
          {onStaging > 0 && <span className="text-xs text-info">{onStaging} on staging</span>}

          {editable && deployablePrs.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                deployAll();
              }}
              disabled={groupDeploying}
              className={`text-xs px-3 py-1.5 rounded-md font-medium whitespace-nowrap transition ${
                groupDeploying
                  ? "bg-accent/40 text-text"
                  : "bg-gradient-to-r from-accent to-accent2 text-white hover:opacity-90 shadow"
              }`}
              title={
                skippedPrs.length
                  ? `Deploys ${deployablePrs.length}, skips ${skippedPrs.length} manual-deploy repo${skippedPrs.length === 1 ? "" : "s"}`
                  : `Comment .deploy staging on all ${deployablePrs.length} PRs`
              }
            >
              {groupDeploying
                ? `Deploying ${done}/${deployablePrs.length}…`
                : `⚡ Deploy group (${deployablePrs.length}${skippedPrs.length ? ` +${skippedPrs.length} skip` : ""})`}
            </button>
          )}
          {editable && onRename && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setEditing(true);
                setDraft(title);
              }}
              className="opacity-0 group-hover/header:opacity-100 text-xs text-muted hover:text-accent2 transition px-1.5 py-0.5 rounded"
              title="Rename group"
            >
              ✎
            </button>
          )}
          <button onClick={() => setOpen((v) => !v)} className="text-muted">
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>

      {showProgress && (
        <div className="mx-3 mt-2 p-3 rounded-lg bg-surface2/70 border border-border">
          <div className="flex items-center gap-3 text-xs">
            <div className="font-semibold">
              Deploying {done}/{states.length}
            </div>
            {okCount > 0 && <span className="text-success">✓ {okCount} ok</span>}
            {errCount > 0 && <span className="text-danger">✕ {errCount} failed</span>}
            <div className="flex-1 h-1.5 bg-bg rounded overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent to-accent2 transition-all"
                style={{ width: `${(done / states.length) * 100}%` }}
              />
            </div>
          </div>
          {errCount > 0 && (
            <ul className="mt-2 text-[11px] text-danger space-y-0.5">
              {Object.entries(groupDeploy)
                .filter(([, v]) => v.state === "err")
                .map(([k, v]) => (
                  <li key={k} className="font-mono">
                    ✕ {k}: {v.message}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}

      {open && (
        <div className="mt-3 grid gap-3 grid-cols-1 lg:grid-cols-2">
          {prs.map((pr) => (
            <PRCard
              key={pr.item.id}
              pr={pr}
              onAfterDeploy={onAfterDeploy}
              onMove={onMovePR}
              knownGroups={knownGroups}
              currentGroup={title}
              deployFeedback={groupDeploy[`${pr.repo}#${pr.item.number}`]}
            />
          ))}
        </div>
      )}
    </section>
  );
}
