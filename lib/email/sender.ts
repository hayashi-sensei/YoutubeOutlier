import type { EmailTemplate } from "./templates";

export const EMAIL_PROVIDER = "resend";

export type EmailStatus = "SENT" | "FAILED" | "SKIPPED";

export type EmailLogInput = {
  workspaceId?: string | null;
  toEmail: string;
  template: string;
  provider: string;
  providerId?: string | null;
  status: EmailStatus;
  errorMessage?: string | null;
  metadata?: unknown;
};

export type EmailLogPrisma = {
  emailLog: {
    create(input: { data: EmailLogInput }): Promise<unknown>;
  };
};

export type EmailEnvironment = {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  EMAIL_FROM?: string;
  APP_BASE_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
};

export type EmailSendResult = {
  status: EmailStatus;
  providerId: string | null;
  errorMessage: string | null;
};

export type EmailSender = (input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
}) => Promise<{ providerId: string | null }>;

export async function sendLoggedEmail(input: {
  prisma: EmailLogPrisma;
  workspaceId?: string | null;
  toEmail: string | null | undefined;
  templateName: string;
  template: EmailTemplate;
  metadata?: unknown;
  env?: EmailEnvironment;
  sender?: EmailSender;
}): Promise<EmailSendResult> {
  const env = input.env ?? process.env;
  const apiKey = env.RESEND_API_KEY;
  const from = env.RESEND_FROM_EMAIL ?? env.EMAIL_FROM;
  const toEmail = input.toEmail?.trim();

  if (!toEmail) {
    return logEmail(input.prisma, {
      workspaceId: input.workspaceId ?? null,
      toEmail: "",
      template: input.templateName,
      provider: EMAIL_PROVIDER,
      status: "SKIPPED",
      errorMessage: "No delivery email was configured.",
      metadata: input.metadata,
    });
  }

  if (!apiKey || !from) {
    return logEmail(input.prisma, {
      workspaceId: input.workspaceId ?? null,
      toEmail,
      template: input.templateName,
      provider: EMAIL_PROVIDER,
      status: "SKIPPED",
      errorMessage: "Resend email delivery is not configured.",
      metadata: input.metadata,
    });
  }

  try {
    const result = await (input.sender ?? sendWithResend)({
      from,
      to: toEmail,
      subject: input.template.subject,
      html: input.template.html,
      text: input.template.text,
      apiKey,
    });

    return logEmail(input.prisma, {
      workspaceId: input.workspaceId ?? null,
      toEmail,
      template: input.templateName,
      provider: EMAIL_PROVIDER,
      providerId: result.providerId,
      status: "SENT",
      metadata: input.metadata,
    });
  } catch (error) {
    return logEmail(input.prisma, {
      workspaceId: input.workspaceId ?? null,
      toEmail,
      template: input.templateName,
      provider: EMAIL_PROVIDER,
      status: "FAILED",
      errorMessage: error instanceof Error ? error.message : "Email delivery failed.",
      metadata: input.metadata,
    });
  }
}

export async function logSkippedEmail(input: {
  prisma: EmailLogPrisma;
  workspaceId?: string | null;
  toEmail?: string | null;
  templateName: string;
  errorMessage: string;
  metadata?: unknown;
}): Promise<EmailSendResult> {
  return logEmail(input.prisma, {
    workspaceId: input.workspaceId ?? null,
    toEmail: input.toEmail?.trim() ?? "",
    template: input.templateName,
    provider: EMAIL_PROVIDER,
    status: "SKIPPED",
    errorMessage: input.errorMessage,
    metadata: input.metadata,
  });
}

async function logEmail(prisma: EmailLogPrisma, input: EmailLogInput): Promise<EmailSendResult> {
  await prisma.emailLog.create({ data: input });

  return {
    status: input.status,
    providerId: input.providerId ?? null,
    errorMessage: input.errorMessage ?? null,
  };
}

async function sendWithResend(input: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  apiKey: string;
}): Promise<{ providerId: string | null }> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  const payload = await safeJson(response);
  if (!response.ok) {
    throw new Error(resendErrorMessage(payload, response.status));
  }

  return {
    providerId: typeof payload?.id === "string" ? payload.id : null,
  };
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const value = await response.json();
    return value !== null && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function resendErrorMessage(payload: Record<string, unknown> | null, status: number): string {
  const message = payload?.message;
  if (typeof message === "string" && message.length > 0) {
    return message;
  }

  return `Resend email delivery failed with HTTP ${status}.`;
}
