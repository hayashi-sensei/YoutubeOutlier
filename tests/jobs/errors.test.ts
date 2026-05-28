import { describe, expect, test } from "vitest";

import { serializeJobError } from "../../lib/jobs/errors";

describe("serializeJobError", () => {
  test("redacts secrets and limits provider payload size", () => {
    const error = new Error("Provider failed");
    Object.assign(error, {
      providerPayload: {
        status: 429,
        apiKey: "sk-live-secret",
        headers: {
          authorization: "Bearer secret-token",
          cookie: "session=secret",
        },
        nested: {
          accessToken: "access-secret",
          refreshToken: "refresh-secret",
          body: "x".repeat(3000),
        },
      },
      retryable: true,
    });

    const serialized = serializeJobError(error);
    const json = JSON.stringify(serialized.metadata);

    expect(serialized).toMatchObject({
      message: "Provider failed",
      retryable: true,
    });
    expect(json).toContain("[REDACTED]");
    expect(json).not.toContain("sk-live-secret");
    expect(json).not.toContain("secret-token");
    expect(json).not.toContain("session=secret");
    expect(json).not.toContain("access-secret");
    expect(json).not.toContain("refresh-secret");
    expect(json.length).toBeLessThanOrEqual(1600);
  });
});
