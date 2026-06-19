import type { PRSearchItem, EnrichedPR } from "../types";

// Extract a "feature key" from a PR for grouping.
// Priorities:
//   1) Jira-style ticket prefix in title or branch (AGENT-1234, GROW-5043)
//   2) Title prefix before ":" (conventional commits)
//   3) Branch name prefix (e.g. "agent-reviews/...", "feat/agent-reviews-...")
const TICKET_RE = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/;

export function featureKeyFromTitle(title: string, branch?: string): string {
  const tTicket = title.match(TICKET_RE);
  if (tTicket) return `${tTicket[1]}-${tTicket[2]}`;
  if (branch) {
    const bTicket = branch.match(TICKET_RE);
    if (bTicket) return `${bTicket[1]}-${bTicket[2]}`;
  }
  // conventional: "feat(area): foo" or "feat: foo"
  const m = title.match(/^(?:[a-z]+)(?:\(([^)]+)\))?\s*:\s*(.+)/i);
  if (m && m[1]) return m[1].toLowerCase();
  // branch prefix
  if (branch) {
    const seg = branch.split(/[\/_-]/).filter(Boolean).slice(0, 2).join("-").toLowerCase();
    if (seg) return seg;
  }
  // fallback: first 3 title words
  return title.split(/\s+/).slice(0, 3).join(" ").toLowerCase() || "misc";
}

export function groupByFeature(prs: EnrichedPR[]): Record<string, EnrichedPR[]> {
  const out: Record<string, EnrichedPR[]> = {};
  for (const pr of prs) {
    const k = pr.featureKey || "misc";
    (out[k] ||= []).push(pr);
  }
  return out;
}

export function groupByRepo(prs: EnrichedPR[]): Record<string, EnrichedPR[]> {
  const out: Record<string, EnrichedPR[]> = {};
  for (const pr of prs) {
    (out[pr.repo] ||= []).push(pr);
  }
  return out;
}

export function repoFromUrl(url: string): { owner: string; name: string; full: string } {
  // https://api.github.com/repos/owner/name
  const parts = url.split("/").slice(-2);
  return { owner: parts[0], name: parts[1], full: `${parts[0]}/${parts[1]}` };
}

export function relativeTime(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}d ago`;
  const mo = Math.floor(days / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export function _enrichSearchItem(item: PRSearchItem): Pick<EnrichedPR, "item" | "repo" | "owner" | "name" | "featureKey"> {
  const r = repoFromUrl(item.repository_url);
  return {
    item,
    repo: r.full,
    owner: r.owner,
    name: r.name,
    featureKey: featureKeyFromTitle(item.title),
  };
}
