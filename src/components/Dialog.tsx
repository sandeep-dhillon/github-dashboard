import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type Tone = "default" | "danger" | "success";

interface AlertOpts {
  title?: string;
  message: ReactNode;
  okText?: string;
  tone?: Tone;
}

interface ConfirmOpts extends AlertOpts {
  cancelText?: string;
}

interface PromptOpts {
  title?: string;
  message?: ReactNode;
  defaultValue?: string;
  placeholder?: string;
  okText?: string;
  cancelText?: string;
  multiline?: boolean;
}

interface DialogApi {
  alert: (opts: AlertOpts | string) => Promise<void>;
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>;
  prompt: (opts: PromptOpts | string) => Promise<string | null>;
}

type Pending =
  | { kind: "alert"; opts: AlertOpts; resolve: () => void }
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "prompt"; opts: PromptOpts; resolve: (v: string | null) => void };

// eslint-disable-next-line react-refresh/only-export-components
export const DialogContext = createContext<DialogApi | null>(null);

// eslint-disable-next-line react-refresh/only-export-components
export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used inside <DialogProvider>");
  return ctx;
}

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);

  const api = useMemo<DialogApi>(
    () => ({
      alert: (opts) =>
        new Promise<void>((resolve) => {
          const o = typeof opts === "string" ? { message: opts } : opts;
          setPending({ kind: "alert", opts: o, resolve });
        }),
      confirm: (opts) =>
        new Promise<boolean>((resolve) => {
          const o = typeof opts === "string" ? { message: opts } : opts;
          setPending({ kind: "confirm", opts: o, resolve });
        }),
      prompt: (opts) =>
        new Promise<string | null>((resolve) => {
          const o = typeof opts === "string" ? { message: opts } : opts;
          setPending({ kind: "prompt", opts: o, resolve });
        }),
    }),
    [],
  );

  const close = useCallback(
    (result: { kind: "alert" } | { kind: "confirm"; v: boolean } | { kind: "prompt"; v: string | null }) => {
      if (!pending) return;
      if (pending.kind === "alert" && result.kind === "alert") pending.resolve();
      else if (pending.kind === "confirm" && result.kind === "confirm") pending.resolve(result.v);
      else if (pending.kind === "prompt" && result.kind === "prompt") pending.resolve(result.v);
      setPending(null);
    },
    [pending],
  );

  return (
    <DialogContext.Provider value={api}>
      {children}
      {pending && <DialogShell pending={pending} close={close} />}
    </DialogContext.Provider>
  );
}

function DialogShell({
  pending,
  close,
}: {
  pending: Pending;
  close: (r: { kind: "alert" } | { kind: "confirm"; v: boolean } | { kind: "prompt"; v: string | null }) => void;
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState(
    pending.kind === "prompt" ? pending.opts.defaultValue ?? "" : "",
  );

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    if (inputRef.current && "select" in inputRef.current) inputRef.current.select();
    return () => clearTimeout(t);
  }, []);

  const cancel = useCallback(() => {
    if (pending.kind === "alert") close({ kind: "alert" });
    if (pending.kind === "confirm") close({ kind: "confirm", v: false });
    if (pending.kind === "prompt") close({ kind: "prompt", v: null });
  }, [pending, close]);

  const accept = useCallback(() => {
    if (pending.kind === "alert") close({ kind: "alert" });
    if (pending.kind === "confirm") close({ kind: "confirm", v: true });
    if (pending.kind === "prompt") close({ kind: "prompt", v: value });
  }, [pending, close, value]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      } else if (e.key === "Enter") {
        if (pending.kind === "prompt" && pending.opts.multiline && !e.metaKey && !e.ctrlKey) return;
        e.preventDefault();
        accept();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accept, cancel, pending]);

  const tone: Tone =
    pending.kind === "prompt" ? "default" : pending.opts.tone ?? "default";
  const okText =
    pending.opts.okText ??
    (pending.kind === "confirm" ? "Confirm" : pending.kind === "prompt" ? "OK" : "OK");
  const cancelText =
    pending.kind !== "alert"
      ? (pending.opts as ConfirmOpts | PromptOpts).cancelText ?? "Cancel"
      : null;
  const title =
    pending.opts.title ??
    (pending.kind === "confirm" ? "Confirm" : pending.kind === "prompt" ? "" : "Notice");

  const okClasses =
    tone === "danger"
      ? "bg-danger text-white hover:bg-danger/90 border-danger"
      : tone === "success"
        ? "bg-success text-white hover:bg-success/90 border-success"
        : "bg-accent text-white hover:bg-accent/90 border-accent";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) cancel();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl shadow-2xl overflow-hidden">
        {title && (
          <div className="px-5 pt-4 pb-2">
            <h3 className="text-sm font-semibold text-text">{title}</h3>
          </div>
        )}
        <div className="px-5 pb-4 text-sm text-text/90 whitespace-pre-wrap break-words max-h-[60vh] overflow-y-auto">
          {pending.opts.message}
        </div>
        {pending.kind === "prompt" && (
          <div className="px-5 pb-4">
            {pending.opts.multiline ? (
              <textarea
                ref={(el) => {
                  inputRef.current = el;
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={pending.opts.placeholder}
                rows={4}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-y"
              />
            ) : (
              <input
                ref={(el) => {
                  inputRef.current = el;
                }}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={pending.opts.placeholder}
                className="w-full bg-surface2 border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
              />
            )}
          </div>
        )}
        <div className="px-5 py-3 bg-surface2/50 border-t border-border flex justify-end gap-2">
          {cancelText && (
            <button
              onClick={cancel}
              className="text-sm px-4 py-2 rounded-lg border border-border bg-surface hover:bg-surface2"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={accept}
            className={`text-sm px-4 py-2 rounded-lg border ${okClasses}`}
            autoFocus={pending.kind !== "prompt"}
          >
            {okText}
          </button>
        </div>
      </div>
    </div>
  );
}
