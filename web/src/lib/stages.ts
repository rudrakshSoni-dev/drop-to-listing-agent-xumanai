export const STAGES = [
  { key: "fetching", label: "Fetching video" },
  { key: "transcribing", label: "Transcribing" },
  { key: "extracting_frames", label: "Picking key frames" },
  { key: "analyzing", label: "Understanding the service" },
  { key: "guardrails", label: "Safety check" },
  { key: "done", label: "Done" },
] as const;

export type StageKey = (typeof STAGES)[number]["key"];
