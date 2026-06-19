import { useState } from "react";

const SEEN_KEY = "gh_welcome_seen_v1";

export function hasSeenWelcome() {
  return localStorage.getItem(SEEN_KEY) === "1";
}

export function markWelcomeSeen() {
  localStorage.setItem(SEEN_KEY, "1");
}

const STEPS = [
  {
    icon: "🔎",
    title: "All your PRs, one place",
    body: "Auto-discovers every open PR you've opened — across every repo you can see. No config, no list to maintain.",
    highlights: [
      "Checks status (pass / fail / running) at a glance",
      "Approval state per PR with reviewer names on hover",
      "+/-, file count, labels, branch → base",
    ],
  },
  {
    icon: "📦",
    title: "Group PRs by feature",
    body: "Use the ⋯ menu on any card to drop PRs into a custom group. Rename groups inline. Empty groups stick around as drop targets.",
    highlights: [
      "Default view: Ungrouped — you decide what's a feature",
      "Groups persist in localStorage; no server, no sync",
      "Each group gets its own status roll-up + deploy button",
    ],
  },
  {
    icon: "⚡",
    title: "Deploy to staging",
    body: "The ⚡ button comments .deploy staging on the PR (the standard PF deploy mechanism). Before posting, the dashboard rebases your branch on master via the GitHub API.",
    highlights: [
      "Rebase via comment — your local clone stays untouched",
      "Conflicts get a red strip on the card with exact resolve commands",
      "Group deploy fires all PRs at once with progress + failure roll-up",
    ],
  },
  {
    icon: "💬",
    title: "Live comment timeline",
    body: "The chat button bottom-right shows new comments on your PRs in real time. Polls every minute. Unread badge tells you when reviewers reply.",
    highlights: [
      "Filters out your own comments",
      "Mark-read state persists locally",
      "One click jumps to the comment on GitHub",
    ],
  },
];

export function Welcome({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step];
  const isLast = step === STEPS.length - 1;

  const close = () => {
    markWelcomeSeen();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-surface border border-border rounded-2xl overflow-hidden shadow-2xl">
        {/* Decorative gradient header */}
        <div className="relative h-32 bg-gradient-to-br from-accent via-accent2 to-info">
          <div className="absolute inset-0 opacity-20 mix-blend-overlay" style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
          <button
            onClick={close}
            className="absolute top-3 right-3 w-8 h-8 rounded-md text-white/80 hover:text-white hover:bg-black/20 transition flex items-center justify-center"
            title="Close"
          >
            ×
          </button>
          <div className="absolute -bottom-8 left-8 w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center text-3xl shadow-xl">
            {s.icon}
          </div>
        </div>

        <div className="px-8 pt-12 pb-6">
          <div className="text-[11px] uppercase tracking-widest text-accent2 font-semibold">
            {step === 0 ? "Welcome to PR Dashboard" : `Step ${step + 1} of ${STEPS.length}`}
          </div>
          <h2 className="text-2xl font-bold mt-1">{s.title}</h2>
          <p className="mt-3 text-muted leading-relaxed">{s.body}</p>

          <ul className="mt-4 space-y-2">
            {s.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-accent/15 text-accent text-xs flex items-center justify-center font-bold shrink-0">
                  ✓
                </span>
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-surface2/50 border-t border-border flex items-center gap-3">
          {/* Progress dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-accent" : "w-1.5 bg-border hover:bg-muted"
                }`}
                title={`Step ${i + 1}`}
              />
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={close}
            className="text-xs text-muted hover:text-text px-2 py-1.5"
          >
            Skip tour
          </button>

          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="text-sm px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface2"
            >
              ← Back
            </button>
          )}

          <button
            onClick={() => (isLast ? close() : setStep((s) => s + 1))}
            className="text-sm px-5 py-2 rounded-lg font-medium bg-gradient-to-r from-accent to-accent2 text-white hover:opacity-90 shadow"
          >
            {isLast ? "Get started 🚀" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
