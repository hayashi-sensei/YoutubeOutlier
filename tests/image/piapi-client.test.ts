import { describe, expect, test, vi } from "vitest";

import { generatePiApiImage } from "../../lib/image/piapi-client";

describe("generatePiApiImage", () => {
  test("creates a PiAPI task, polls for completion, and returns base64 image output", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { task_id: "task-1" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            task_id: "task-1",
            status: "processing",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            task_id: "task-1",
            status: "success",
            output: {
              image_url: "https://cdn.example.com/out.png",
            },
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "Content-Type": "image/png" },
        }),
      );

    const result = await generatePiApiImage({
      model: "Qubico/flux1-dev",
      prompt: "A bright YouTube thumbnail concept",
      aspectRatio: "16:9",
      apiKey: "piapi-test-key",
      fetcher,
      sleep: vi.fn(async () => undefined),
      pollIntervalMs: 1,
      maxPollAttempts: 2,
    });

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://api.piapi.ai/api/v1/task",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-API-Key": "piapi-test-key",
        }),
        body: JSON.stringify({
          model: "Qubico/flux1-dev",
          task_type: "txt2img",
          input: {
            prompt: "A bright YouTube thumbnail concept",
            width: 1344,
            height: 768,
          },
        }),
      }),
    );
    expect(result).toEqual({
      taskId: "task-1",
      responseJson: expect.objectContaining({
        data: expect.objectContaining({
          status: "success",
        }),
      }),
      files: [
        {
          mediaType: "image/png",
          base64: "AQID",
        },
      ],
    });
  });

  test("fails when PiAPI reports a failed task", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ code: 200, data: { task_id: "task-1" } }))
      .mockResolvedValueOnce(
        jsonResponse({
          code: 200,
          data: {
            task_id: "task-1",
            status: "failed",
            error: { message: "quota exceeded" },
          },
        }),
      );

    await expect(
      generatePiApiImage({
        model: "Qubico/flux1-dev",
        prompt: "A bright YouTube thumbnail concept",
        aspectRatio: "1:1",
        apiKey: "piapi-test-key",
        fetcher,
        sleep: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow("quota exceeded");
  });
});

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
