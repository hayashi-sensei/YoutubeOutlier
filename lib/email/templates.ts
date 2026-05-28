export type EmailTemplate = {
  subject: string;
  html: string;
  text: string;
};

export type DailyReportEmailInput = {
  workspaceName: string;
  reportTitle: string;
  reportSummary: string | null;
  reportUrl: string;
  generatedAt: Date | null;
};

export type ExportReadyEmailInput = {
  workspaceName: string;
  reportTitle: string;
  fileType: string;
  reportUrl: string;
  expiresAt: Date | null;
};

export type BillingEmailInput = {
  workspaceName: string;
  subject: string;
  headline: string;
  body: string;
  actionUrl?: string | null;
};

export function dailyReportEmailTemplate(input: DailyReportEmailInput): EmailTemplate {
  const generatedLabel = input.generatedAt ? formatDate(input.generatedAt) : "just now";
  const summary = input.reportSummary ?? "Your latest research report is ready to review.";
  const subject = `${input.reportTitle} is ready`;

  return {
    subject,
    html: baseTemplate({
      preheader: summary,
      headline: "Your daily research report is ready",
      body: [
        `Workspace: ${input.workspaceName}`,
        `Generated: ${generatedLabel}`,
        summary,
      ],
      actionLabel: "Open report",
      actionUrl: input.reportUrl,
    }),
    text: [
      "Your daily research report is ready.",
      `Workspace: ${input.workspaceName}`,
      `Generated: ${generatedLabel}`,
      summary,
      `Open report: ${input.reportUrl}`,
    ].join("\n"),
  };
}

export function exportReadyEmailTemplate(input: ExportReadyEmailInput): EmailTemplate {
  const fileType = input.fileType.toUpperCase();
  const expiryLabel = input.expiresAt ? `This ${fileType} link expires ${formatDate(input.expiresAt)}.` : null;
  const subject = `${fileType} export ready: ${input.reportTitle}`;

  return {
    subject,
    html: baseTemplate({
      preheader: `${fileType} export is ready for ${input.reportTitle}.`,
      headline: `${fileType} export ready`,
      body: [
        `Workspace: ${input.workspaceName}`,
        `Report: ${input.reportTitle}`,
        expiryLabel,
      ].filter((line): line is string => Boolean(line)),
      actionLabel: "Open report",
      actionUrl: input.reportUrl,
    }),
    text: [
      `${fileType} export ready.`,
      `Workspace: ${input.workspaceName}`,
      `Report: ${input.reportTitle}`,
      expiryLabel,
      `Open report: ${input.reportUrl}`,
    ].filter((line): line is string => Boolean(line)).join("\n"),
  };
}

export function billingEmailTemplate(input: BillingEmailInput): EmailTemplate {
  return {
    subject: input.subject,
    html: baseTemplate({
      preheader: input.body,
      headline: input.headline,
      body: [`Workspace: ${input.workspaceName}`, input.body],
      actionLabel: input.actionUrl ? "View billing" : undefined,
      actionUrl: input.actionUrl ?? undefined,
    }),
    text: [
      input.headline,
      `Workspace: ${input.workspaceName}`,
      input.body,
      input.actionUrl ? `View billing: ${input.actionUrl}` : null,
    ].filter((line): line is string => Boolean(line)).join("\n"),
  };
}

function baseTemplate(input: {
  preheader: string;
  headline: string;
  body: string[];
  actionLabel?: string;
  actionUrl?: string;
}): string {
  const bodyHtml = input.body
    .map((line) => `<p style="margin:0 0 14px;color:#344054;font-size:14px;line-height:1.5;">${escapeHtml(line)}</p>`)
    .join("");
  const actionHtml = input.actionLabel && input.actionUrl
    ? `<p style="margin:22px 0 0;"><a href="${escapeAttribute(input.actionUrl)}" style="display:inline-block;border-radius:6px;background:#0F766E;color:#ffffff;font-size:14px;font-weight:700;padding:10px 14px;text-decoration:none;">${escapeHtml(input.actionLabel)}</a></p>`
    : "";

  return `<!doctype html>
<html>
  <head>
    <meta charSet="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(input.headline)}</title>
  </head>
  <body style="margin:0;background:#F8FAFC;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(input.preheader)}</span>
    <div style="padding:32px 18px;">
      <main style="margin:0 auto;max-width:620px;border:1px solid #D0D5DD;border-radius:8px;background:#ffffff;padding:24px;">
        <p style="margin:0 0 8px;color:#0F766E;font-size:12px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;">YTResearch</p>
        <h1 style="margin:0 0 18px;color:#101828;font-size:22px;line-height:1.25;">${escapeHtml(input.headline)}</h1>
        ${bodyHtml}
        ${actionHtml}
      </main>
    </div>
  </body>
</html>`;
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll("'", "&#39;");
}
