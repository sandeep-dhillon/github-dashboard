import { useState } from "react";
import { saveGroupOrder } from "../lib/groups";

export function PriorityManager({
  groups,
  onClose,
  onApplied,
}: {
  groups: string[];
  onClose: () => void;
  onApplied: () => void;
}) {
  const [order, setOrder] = useState<string[]>(groups);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    setOrder(next);
  };

  const save = () => {
    saveGroupOrder(order);
    onApplied();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-accent2 font-semibold">
              Manage priority
            </div>
            <h2 className="text-lg font-semibold mt-0.5">Reorder your groups</h2>
            <p className="text-xs text-muted mt-1">
              Drag a row, or use the arrows. Highest priority sits at the top.
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-md text-muted hover:text-text hover:bg-surface2 flex items-center justify-center text-lg shrink-0"
          >
            ×
          </button>
        </div>

        <div className="px-3 py-3 max-h-[60vh] overflow-y-auto">
          {order.length === 0 && (
            <div className="text-center text-sm text-muted py-10">
              No groups yet. Create some from the ⋯ menu on a PR card.
            </div>
          )}

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
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-surface2 transition ${
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
        </div>

        <div className="px-6 py-3 bg-surface2/50 border-t border-border flex justify-between items-center">
          <button
            onClick={() => setOrder([...groups].sort((a, b) => a.localeCompare(b)))}
            disabled={!order.length}
            className="text-xs text-muted hover:text-text disabled:opacity-40"
          >
            ↻ Sort A→Z
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface2"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={!order.length}
              className="text-sm px-5 py-2 rounded-lg font-medium bg-gradient-to-r from-accent to-accent2 text-white hover:opacity-90 shadow disabled:opacity-50"
            >
              Save order
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
