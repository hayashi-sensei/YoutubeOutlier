import { describe, expect, test } from "vitest";
import { getPasswordSignUpErrorMessage, getPasswordSignUpRedirect } from "../../lib/auth/signup-result";

describe("password signup response handling", () => {
  test("sends confirmed sessions into the app", () => {
    expect(getPasswordSignUpRedirect({ session: { access_token: "token" }, user: { identities: [{}] } })).toBe(
      "/app/dashboard",
    );
  });

  test("does not claim confirmation was sent for existing confirmed users", () => {
    expect(getPasswordSignUpRedirect({ session: null, user: { identities: [] } })).toBe(
      "/sign-up?status=check_email_or_sign_in",
    );
  });

  test("keeps new unconfirmed users on the neutral email next-step state", () => {
    expect(getPasswordSignUpRedirect({ session: null, user: { identities: [{}] } })).toBe(
      "/sign-up?status=check_email_or_sign_in",
    );
  });

  test("makes Supabase email delivery failures actionable", () => {
    expect(getPasswordSignUpErrorMessage("Error sending confirmation email")).toBe(
      "Could not send the confirmation email. Check Supabase Auth SMTP settings and email rate limits, then try again.",
    );
  });
});
