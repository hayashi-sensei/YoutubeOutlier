import { AiOperationSubmit } from "@/components/shared/ai-operation-submit";

type GenerateReportSubmitProps = {
  size?: "default" | "compact";
};

export function GenerateReportSubmit({ size = "default" }: GenerateReportSubmitProps) {
  const isCompact = size === "compact";

  return (
    <AiOperationSubmit
      className={[
        "inline-flex items-center justify-center gap-2 rounded-[var(--yt-radius-button)] bg-[var(--yt-primary)] font-bold text-white shadow-sm transition hover:bg-[var(--yt-primary-hover)] disabled:cursor-wait disabled:opacity-80",
        isCompact ? "px-3 py-2 text-sm" : "px-4 py-2 text-sm",
      ].join(" ")}
      label="Generate Report"
      overlayLabel="Generating your research report..."
      pendingLabel="Generating..."
    />
  );
}
