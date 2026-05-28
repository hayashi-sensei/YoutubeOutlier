export type PasswordSignUpData = {
  session: unknown | null;
  user: {
    identities?: unknown[] | null;
  } | null;
};

export function getPasswordSignUpRedirect(data: PasswordSignUpData): string {
  if (data.session) {
    return "/app/dashboard";
  }

  return "/sign-up?status=check_email_or_sign_in";
}

export function getPasswordSignUpErrorMessage(message: string): string {
  if (message.toLowerCase().includes("error sending confirmation email")) {
    return "Could not send the confirmation email. Check Supabase Auth SMTP settings and email rate limits, then try again.";
  }

  return message;
}
