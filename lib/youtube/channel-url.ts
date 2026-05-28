export type ParsedYoutubeChannelUrl =
  | { type: "channelId"; value: string; canonicalUrl: string }
  | { type: "handle"; value: string; canonicalUrl: string }
  | { type: "custom"; value: string; canonicalUrl: string }
  | { type: "user"; value: string; canonicalUrl: string };

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"]);

function trimSlash(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

export function parseYoutubeChannelUrl(input: string): ParsedYoutubeChannelUrl {
  let url: URL;

  try {
    url = new URL(input.trim());
  } catch {
    throw new Error("Enter a valid YouTube channel URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Enter a valid YouTube channel URL.");
  }

  const hostname = url.hostname.toLowerCase();

  if (!YOUTUBE_HOSTS.has(hostname)) {
    throw new Error("Enter a valid YouTube channel URL.");
  }

  const segments = trimSlash(url.pathname).split("/").filter(Boolean);
  const first = segments[0] ?? "";

  if (["watch", "playlist", "shorts", "embed"].includes(first)) {
    throw new Error("Enter a YouTube channel URL, not a video or playlist URL.");
  }

  if (first.startsWith("@") && first.length > 1) {
    const handle = first.toLowerCase();
    return {
      type: "handle",
      value: handle,
      canonicalUrl: `https://www.youtube.com/${handle}`,
    };
  }

  if (first === "channel" && segments[1]) {
    return {
      type: "channelId",
      value: segments[1],
      canonicalUrl: `https://www.youtube.com/channel/${segments[1]}`,
    };
  }

  if ((first === "c" || first === "user") && segments[1]) {
    return {
      type: first === "c" ? "custom" : "user",
      value: segments[1],
      canonicalUrl: `https://www.youtube.com/${first}/${segments[1]}`,
    };
  }

  throw new Error("Enter a valid YouTube channel URL.");
}
