import { describe, expect, it } from "vitest";

import { dropEventsReducer, initialState, type Action, type DropEvent } from "./use-drop-events";

let seq = 0;
const ev = (event: DropEvent, t: number, extra: { replayed?: boolean } = {}): Action => ({
  type: "event",
  event: { ...event, seq: seq++, t, ...extra } as Extract<Action, { type: "event" }>["event"],
  receivedAt: 1000 + t,
});

const run = (...actions: Action[]) => actions.reduce(dropEventsReducer, initialState());

describe("dropEventsReducer", () => {
  it("advances stages and records durations from server time", () => {
    seq = 0;
    const state = run(
      ev({ kind: "stage", stage: "fetching", detail: "Reading" }, 0),
      ev({ kind: "stage", stage: "transcribing", detail: null }, 400),
      ev({ kind: "detail", detail: "Heard: “hi”" }, 900),
    );
    expect(state.status).toBe("running");
    expect(state.stages.fetching).toMatchObject({ status: "done", startT: 0, endT: 400 });
    expect(state.stages.transcribing).toMatchObject({ status: "active", detail: "Heard: “hi”" });
    expect(state.stages.analyzing.status).toBe("pending");
  });

  it("marks every stage done on completion", () => {
    seq = 0;
    const state = run(
      ev({ kind: "stage", stage: "fetching", detail: null }, 0),
      ev({ kind: "transcript", lines: [{ start: 0, end: 1, text: "hi" }] }, 10),
      ev({ kind: "done", listing_id: "abc" }, 20),
    );
    expect(state.status).toBe("done");
    expect(Object.values(state.stages).every((s) => s.status === "done")).toBe(true);
    expect(state.transcript).toHaveLength(1);
    expect(state.replayed).toBe(false);
  });

  it("marks the active stage as failed on error", () => {
    seq = 0;
    const state = run(
      ev({ kind: "stage", stage: "fetching", detail: null }, 0),
      ev({ kind: "stage", stage: "analyzing", detail: null }, 50),
      ev({ kind: "error", code: "LLM_SCHEMA_FAIL", stage: "analyzing" }, 90),
    );
    expect(state.status).toBe("error");
    expect(state.errorCode).toBe("LLM_SCHEMA_FAIL");
    expect(state.stages.analyzing.status).toBe("error");
  });

  it("ignores events replayed after a reconnect", () => {
    seq = 0;
    const first = ev({ kind: "stage", stage: "fetching", detail: "a" }, 0);
    const second = ev({ kind: "stage", stage: "transcribing", detail: null }, 300);
    const state = run(first, second, first);
    expect(state.stages.transcribing.status).toBe("active");
    expect(state.lastSeq).toBe(1);
  });

  it("flags synthesized replays so the UI can skip the ready toast", () => {
    seq = 0;
    const state = run(ev({ kind: "done", listing_id: "x" }, 0, { replayed: true }));
    expect(state.status).toBe("done");
    expect(state.replayed).toBe(true);
  });

  it("records media url and key frames for link drops", () => {
    const state = run(
      ev({ kind: "stage", stage: "fetching", detail: "Downloading from YouTube" }, 0),
      ev(
        {
          kind: "media",
          duration_s: 30,
          width: 720,
          height: 1280,
          media_url: "/api/media/a/source.mp4",
        },
        900,
      ),
      ev(
        {
          kind: "frames",
          frames: [{ file: "frame_00.jpg", t: 1 }],
          thumbnail: "frame_00.jpg",
        },
        1200,
      ),
    );
    expect(state.media?.media_url).toBe("/api/media/a/source.mp4");
    expect(state.frames).toHaveLength(1);
    expect(state.thumbnail).toBe("frame_00.jpg");
  });
});
