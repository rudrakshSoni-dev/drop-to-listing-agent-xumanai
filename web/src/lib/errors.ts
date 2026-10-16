export interface ErrorCopy {
  title: string;
  description: string;
  retryable: boolean;
}

const COPY: Record<string, ErrorCopy> = {
  VIDEO_PRIVATE: {
    title: "That video isn't public",
    description: "That video isn't public. Try another link or upload the file.",
    retryable: false,
  },
  VIDEO_TOO_LONG: {
    title: "That video is too long",
    description: "Videos up to 3 minutes for now.",
    retryable: false,
  },
  VIDEO_UNREADABLE: {
    title: "We couldn't read that video",
    description: "The file looks damaged or uses an unusual format. Try exporting it as mp4.",
    retryable: false,
  },
  UPLOAD_INVALID: {
    title: "That file didn't work",
    description: "Upload an mp4 or mov under 3 minutes.",
    retryable: false,
  },
  LINK_UNSUPPORTED: {
    title: "We can't import that link",
    description: "Paste a public Instagram, TikTok or YouTube link, or upload the file.",
    retryable: false,
  },
  VIDEO_UNAVAILABLE: {
    title: "That video isn't available",
    description: "It may have been removed or region-locked. Try another link or upload the file.",
    retryable: false,
  },
  FETCH_BLOCKED: {
    title: "The platform blocked the download",
    description:
      "Some platforms ask for a login or block servers. Download the video yourself and upload it, or try an example.",
    retryable: true,
  },
  LLM_QUOTA: {
    title: "Today's free demo quota is used up",
    description:
      "This demo runs on a free AI tier. Try an example, or run it locally with your own free key.",
    retryable: false,
  },
  RATE_LIMITED: {
    title: "That's today's limit for new videos",
    description:
      "To keep the free demo up for everyone, each visitor gets a few videos a day. Try an example.",
    retryable: false,
  },
  TRANSCRIBE_FAIL: {
    title: "We couldn't transcribe the audio",
    description: "Something went wrong while listening to the video. Retry?",
    retryable: true,
  },
  LLM_SCHEMA_FAIL: {
    title: "The listing didn't come out right",
    description: "The model's answer didn't fit our listing format. Retry?",
    retryable: true,
  },
  LLM_UNAVAILABLE: {
    title: "The AI service is unavailable",
    description: "We couldn't reach the model. Check the API key, then retry.",
    retryable: true,
  },
  NETWORK: {
    title: "Can't reach the server",
    description: "Check that the API is running, then retry.",
    retryable: true,
  },
  NOT_FOUND: {
    title: "Not found",
    description: "That link doesn't point to anything we have.",
    retryable: false,
  },
};

const FALLBACK: ErrorCopy = {
  title: "Something went wrong",
  description: "An unexpected error stopped this run. Retry?",
  retryable: true,
};

export function errorCopy(code: string | null | undefined): ErrorCopy {
  return (code && COPY[code]) || FALLBACK;
}
