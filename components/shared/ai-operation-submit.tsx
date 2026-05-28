"use client";

import { useFormStatus } from "react-dom";

type AiOperationSubmitProps = {
  label: string;
  pendingLabel?: string;
  overlayLabel?: string;
  className: string;
  disabled?: boolean;
};

export function AiOperationSubmit({
  label,
  pendingLabel,
  overlayLabel,
  className,
  disabled = false,
}: AiOperationSubmitProps) {
  const { pending } = useFormStatus();
  const busyLabel = pendingLabel ?? "Generating...";
  const screenLabel = overlayLabel ?? busyLabel;

  return (
    <>
      {pending ? (
        <div
          aria-live="polite"
          className="fixed inset-0 z-[100] grid place-items-center bg-white/80 px-6 backdrop-blur-[2px]"
          role="status"
        >
          <div className="grid min-w-64 place-items-center gap-3 rounded-[var(--yt-radius-card)] border border-[var(--yt-border)] bg-white px-5 py-4 text-center shadow-[var(--yt-shadow)]">
            <span
              aria-hidden="true"
              className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--yt-primary-soft)] border-t-[var(--yt-primary)]"
            />
            <span className="text-sm font-bold text-[var(--yt-text)]">{screenLabel}</span>
          </div>
        </div>
      ) : null}
      <button
        aria-busy={pending}
        className={className}
        disabled={disabled || pending}
        type="submit"
      >
        {pending ? busyLabel : label}
      </button>
    </>
  );
}
