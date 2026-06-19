import { useEffect, useMemo, useState } from "react";
import type { CommentEvent } from "../api/github";
import { fetchRecentComments } from "../api/github";
import type { EnrichedPR } from "../types";
import { relativeTime } from "../lib/feature";
import { useSettings } from "../lib/settings";

const STORAGE_SEEN = "gh_seen_comments";

function loadSeen(): Set<number> {
  try {
    return new Set<number>(JSON.parse(localStorage.getItem(STORAGE_SEEN) || "[]"));
  } catch {
    return new Set();
  }
}
function saveSeen(set: Set<number>) {
  // Cap to last 500 ids so storage doesn't grow forever.
  const arr = Array.from(set).slice(-500);
  localStorage.setItem(STORAGE_SEEN, JSON.stringify(arr));
}

export function CommentTimeline({
  prs,
  myLogin,
  open,
  setOpen,
}: {
  prs: EnrichedPR[];
  myLogin: string | null;
  open: boolean;
  setOpen: (v: boolean) => void;
}) {
  const [events, setEvents] = useState<CommentEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [seen, setSeen] = useState<Set<number>>(() => loadSeen());
  const [settings] = useSettings();

  const sources = useMemo(
    () =>
      prs
        .filter((p) => p.details)
        .map((p) => ({
          repo: p.repo,
          owner: p.owner,
          name: p.name,
          number: p.item.number,
          title: p.item.title,
          html_url: p.item.html_url,
        })),
    [prs],
  );

  useEffect(() => {
    if (!sources.length) return;
    let cancelled = false;

    const poll = async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const list = await fetchRecentComments(sources, since);
        // Hide my own comments — I don't need to be alerted to them.
        const filtered = list.filter((c) => c.author !== myLogin);
        if (!cancelled) setEvents(filtered);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    poll();
    const id = setInterval(poll, settings.timelinePollMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [sources, myLogin, settings.timelinePollMs]);

  const unread = events.filter((e) => !seen.has(e.id)).length;

  const markAllRead = () => {
    const next = new Set(seen);
    for (const e of events) next.add(e.id);
    setSeen(next);
    saveSeen(next);
  };

  return (
    <>
      {/* floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-30 w-14 h-14 rounded-full bg-gradient-to-br from-accent to-accent2 text-white shadow-2xl flex items-center justify-center text-xl hover:scale-105 transition"
          title={`${unread} new comment${unread === 1 ? "" : "s"}`}
        >
          <span className="relative">
            💬
            {unread > 0 && (
              <span className="absolute -top-2 -right-3 bg-danger text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </span>
        </button>
      )}

      {/* sidebar */}
      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-96 bg-bg/95 backdrop-blur-xl border-l border-border z-40 transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <div className="font-semibold">Comments on your PRs</div>
            <div className="text-[11px] text-muted">
              {loading
                ? "syncing…"
                : `${events.length} in last 7 days · polls every ${Math.round(settings.timelinePollMs / 60_000)}m`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={markAllRead}
              disabled={unread === 0}
              className="text-xs px-2 py-1 rounded border border-border bg-surface2 hover:bg-surface disabled:opacity-40"
            >
              Mark read
            </button>
            <button
              onClick={() => setOpen(false)}
              className="w-8 h-8 rounded hover:bg-surface text-muted hover:text-text text-lg"
              title="Close"
            >
              ×
            </button>
          </div>
        </div>

        <div className="overflow-y-auto h-[calc(100%-60px)] pb-12">
          {events.length === 0 && (
            <div className="text-center py-16 text-muted text-sm">
              {loading ? "Loading…" : "No new comments in the last 7 days."}
            </div>
          )}
          <ul className="divide-y divide-border">
            {events.map((e) => {
              const isUnread = !seen.has(e.id);
              return (
                <li
                  key={e.id}
                  className={`px-4 py-3 hover:bg-surface/60 transition relative ${
                    isUnread ? "bg-accent/[0.06]" : ""
                  }`}
                >
                  {isUnread && (
                    <span className="absolute left-1 top-5 w-1.5 h-1.5 rounded-full bg-accent" />
                  )}
                  <div className="flex items-start gap-3">
                    {e.authorAvatar && (
                      <img src={e.authorAvatar} className="w-8 h-8 rounded-full border border-border shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <span className="font-semibold">@{e.author}</span>
                        {e.kind === "review" && (
                          <span className="px-1.5 py-0.5 rounded bg-info/15 text-info text-[10px] uppercase">
                            review
                          </span>
                        )}
                        <span className="text-muted">· {relativeTime(e.createdAt)}</span>
                      </div>
                      <a
                        href={e.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block mt-0.5 text-xs text-accent2 hover:underline truncate font-mono"
                        title={e.prTitle}
                      >
                        {e.repo}#{e.prNumber}
                      </a>
                      <p
                        className="mt-1 text-sm text-text/90 line-clamp-4 whitespace-pre-wrap break-words"
                        title={e.body}
                      >
                        {e.body || <em className="text-muted">(empty comment)</em>}
                      </p>
                      <a
                        href={e.htmlUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => {
                          const next = new Set(seen);
                          next.add(e.id);
                          setSeen(next);
                          saveSeen(next);
                        }}
                        className="mt-1.5 inline-block text-[11px] text-muted hover:text-accent2"
                      >
                        ↗ open in github
                      </a>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </>
  );
}
