import type { EnrichedPR } from "../types";

const STORAGE_KEY = "gh_group_overrides";
const KNOWN_GROUPS_KEY = "gh_known_groups";
const ORDER_KEY = "gh_group_order";
export const UNGROUPED = "Ungrouped";

export function loadGroupOrder(): string[] {
  try {
    return JSON.parse(localStorage.getItem(ORDER_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveGroupOrder(order: string[]) {
  localStorage.setItem(ORDER_KEY, JSON.stringify(Array.from(new Set(order))));
}

// Move `name` to a given index in the current order, inserting it if missing.
export function moveGroupTo(name: string, toIndex: number): string[] {
  const list = loadGroupOrder().filter((g) => g !== name);
  const clamped = Math.max(0, Math.min(toIndex, list.length));
  list.splice(clamped, 0, name);
  saveGroupOrder(list);
  return list;
}

export function moveGroupBy(name: string, delta: number, allGroups: string[]): string[] {
  // Use the merged order (saved order, then any new known groups in default order)
  const saved = loadGroupOrder();
  const known = saved.filter((g) => allGroups.includes(g));
  for (const g of allGroups) if (!known.includes(g)) known.push(g);
  const idx = known.indexOf(name);
  if (idx < 0) return saved;
  const target = Math.max(0, Math.min(known.length - 1, idx + delta));
  if (target === idx) return saved;
  const next = [...known];
  next.splice(idx, 1);
  next.splice(target, 0, name);
  saveGroupOrder(next);
  return next;
}

export function sortByOrder(groupNames: string[]): string[] {
  const order = loadGroupOrder();
  const ranked: string[] = [];
  for (const name of order) if (groupNames.includes(name)) ranked.push(name);
  for (const name of groupNames) if (!ranked.includes(name) && name !== UNGROUPED) ranked.push(name);
  if (groupNames.includes(UNGROUPED)) ranked.push(UNGROUPED);
  return ranked;
}

export type Overrides = Record<string, string>; // prKey -> group name

export function prKey(pr: EnrichedPR): string {
  return `${pr.repo}#${pr.item.number}`;
}

export function loadOverrides(): Overrides {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

export function saveOverrides(o: Overrides) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
}

export function loadKnownGroups(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KNOWN_GROUPS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function saveKnownGroups(g: string[]) {
  localStorage.setItem(KNOWN_GROUPS_KEY, JSON.stringify(Array.from(new Set(g))));
}

export function addKnownGroup(name: string): string[] {
  const list = loadKnownGroups();
  if (!list.includes(name)) list.push(name);
  saveKnownGroups(list);
  return list;
}

export function removeKnownGroup(name: string): string[] {
  const list = loadKnownGroups().filter((g) => g !== name);
  saveKnownGroups(list);
  return list;
}

export function effectiveGroup(pr: EnrichedPR, overrides: Overrides): string {
  const k = prKey(pr);
  const o = overrides[k];
  if (o && o.trim()) return o.trim();
  return UNGROUPED;
}

export function groupPRs(prs: EnrichedPR[], overrides: Overrides): Record<string, EnrichedPR[]> {
  const out: Record<string, EnrichedPR[]> = {};
  for (const pr of prs) {
    const g = effectiveGroup(pr, overrides);
    (out[g] ||= []).push(pr);
  }
  return out;
}

export function setPRGroup(o: Overrides, key: string, group: string | null): Overrides {
  const next = { ...o };
  if (!group) delete next[key];
  else next[key] = group;
  saveOverrides(next);
  return next;
}

// Rename a group: every PR currently in `from` gets explicit override `to`.
export function renameGroup(
  o: Overrides,
  prs: EnrichedPR[],
  from: string,
  to: string,
): Overrides {
  const next = { ...o };
  for (const pr of prs) {
    if (effectiveGroup(pr, o) === from) next[prKey(pr)] = to;
  }
  saveOverrides(next);
  const known = loadKnownGroups();
  const idx = known.indexOf(from);
  if (idx >= 0) known[idx] = to;
  else known.push(to);
  saveKnownGroups(known);
  const order = loadGroupOrder();
  const oIdx = order.indexOf(from);
  if (oIdx >= 0) {
    order[oIdx] = to;
    saveGroupOrder(order);
  }
  return next;
}
