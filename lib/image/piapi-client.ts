import type { ImageAspectRatio } from "@/types/ai";

type PiApiFetch = typeof fetch;

type PiApiTaskResponse = {
  code: number;
  message?: string;
  data?: {
    task_id?: string;
    model?: string;
    task_type?: string;
    status?: string;
    input?: unknown;
    output?: {
      image_url?: string;
      image_base64?: string;
    };
    error?: {
      message?: string;
      raw_message?: string;
    };
  };
};

export type GeneratePiApiImageInput = {
  model: string;
  prompt: string;
  aspectRatio: ImageAspectRatio;
  apiKey?: string;
  baseUrl?: string;
  fetcher?: PiApiFetch;
  sleep?: (milliseconds: number) => Promise<void>;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
};

export type GeneratePiApiImageResult = {
  taskId: string;
  responseJson: PiApiTaskResponse;
  files: Array<{
    mediaType: string;
    base64: string;
  }>;
};

const DEFAULT_BASE_URL = "https://api.piapi.ai";
const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_MAX_POLL_ATTEMPTS = 20;

export async function generatePiApiImage(input: GeneratePiApiImageInput): Promise<GeneratePiApiImageResult> {
  const apiKey = input.apiKey ?? process.env.PIAPI_API_KEY;
  if (!apiKey) {
    throw new Error("PIAPI_API_KEY is required for PiAPI image generation.");
  }

  const fetcher = input.fetcher ?? fetch;
  const baseUrl = input.baseUrl ?? DEFAULT_BASE_URL;
  const createResponse = await requestPiApi(fetcher, `${baseUrl}/api/v1/task`, apiKey, {
    method: "POST",
    body: JSON.stringify({
      model: input.model,
      task_type: "txt2img",
      input: {
        prompt: input.prompt,
        ...dimensionsForAspectRatio(input.aspectRatio),
      },
    }),
  });
  const taskId = createResponse.data?.task_id;
  if (!taskId) {
    throw new Error(createResponse.message ?? "PiAPI did not return a task id.");
  }

  const finalResponse = await pollPiApiTask({
    apiKey,
    baseUrl,
    fetcher,
    taskId,
    sleep: input.sleep ?? sleep,
    pollIntervalMs: input.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    maxPollAttempts: input.maxPollAttempts ?? DEFAULT_MAX_POLL_ATTEMPTS,
  });
  const output = finalResponse.data?.output;
  const base64 = output?.image_base64 || (await fetchImageAsBase64(fetcher, output?.image_url));

  return {
    taskId,
    responseJson: finalResponse,
    files: [
      {
        mediaType: inferMediaType(output?.image_url),
        base64,
      },
    ],
  };
}

async function pollPiApiTask(input: {
  apiKey: string;
  baseUrl: string;
  fetcher: PiApiFetch;
  taskId: string;
  sleep: (milliseconds: number) => Promise<void>;
  pollIntervalMs: number;
  maxPollAttempts: number;
}) {
  for (let attempt = 0; attempt < input.maxPollAttempts; attempt += 1) {
    const response = await requestPiApi(input.fetcher, `${input.baseUrl}/api/v1/task/${input.taskId}`, input.apiKey);
    const status = response.data?.status?.toLowerCase();
    if (status === "success" || status === "completed") {
      return response;
    }
    if (status === "failed") {
      throw new Error(response.data?.error?.message || response.data?.error?.raw_message || "PiAPI image task failed.");
    }
    await input.sleep(input.pollIntervalMs);
  }

  throw new Error("PiAPI image task timed out before completion.");
}

async function requestPiApi(fetcher: PiApiFetch, url: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetcher(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
      ...init.headers,
    },
  });
  const json = (await response.json()) as PiApiTaskResponse;
  if (!response.ok || json.code >= 400) {
    throw new Error(json.message ?? `PiAPI request failed with status ${response.status}.`);
  }
  return json;
}

async function fetchImageAsBase64(fetcher: PiApiFetch, imageUrl?: string) {
  if (!imageUrl) {
    throw new Error("PiAPI completed without an image output.");
  }

  const response = await fetcher(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch PiAPI image output with status ${response.status}.`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.toString("base64");
}

function dimensionsForAspectRatio(aspectRatio: ImageAspectRatio) {
  switch (aspectRatio) {
    case "1:1":
      return { width: 1024, height: 1024 };
    case "4:5":
      return { width: 1024, height: 1280 };
    case "16:9":
      return { width: 1344, height: 768 };
  }
}

function inferMediaType(imageUrl?: string) {
  if (imageUrl?.toLowerCase().endsWith(".jpg") || imageUrl?.toLowerCase().endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (imageUrl?.toLowerCase().endsWith(".webp")) {
    return "image/webp";
  }
  return "image/png";
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
