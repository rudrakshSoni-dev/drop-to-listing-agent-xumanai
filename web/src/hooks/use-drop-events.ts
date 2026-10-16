"use client";

import { useEffect, useReducer } from "react";

import { api } from "@/lib/api";
import type { TranscriptLine } from "@/lib/schema";
import { STAGES, type StageKey } from "@/lib/stages";

export type StageStatus = "pending" | "active" | "done" | "error";

export interface StageState {
  status: StageStatus;
  /** Server ms-since-start when the stage began / ended. */
  startT?: number;
  endT?: number;
  /** Client clock (ms) when the start event arrived, for a live elapsed counter. */
  receivedAt?: number;
  detail?: string;
}

export interface DropEventsState {
  status: "connecting" | "running" | "done" | "error";
  stages: Record<StageKey, StageState>;
  transcript: TranscriptLine[] | null;
  media: { duration_s: number; width: number | null; height: number | null } | null;
  errorCode: string | null;
  /** True when the terminal state came from a replay rather than a live run. */
  replayed: boolean;
  lastSeq: number;
}

export type DropEvent =
  | { kind: "stage"; stage: Exclude<StageKey, "done">; detail: string | null }
  | { kind: "detail"; detail: string }
  | { kind: "media"; duration_s: number; width: number | null; height: number | null }
  | { kind: "transcript"; lines: TranscriptLine[] }
  | { kind: "done"; listing_id: string }
  | { kind: "error"; code: string; stage: StageKey | null };

type Envelope = DropEvent & { seq: number; t: number; replayed?: boolean };

export type Action = { type: "event"; event: Envelope; receivedAt: number } | { type: "reset" };

export function initialState(): DropEventsState {
  const stages = Object.fromEntries(
    STAGES.map(({ key }) => [key, { status: "pending" } satisfies StageState]),
  ) as Record<StageKey, StageState>;
  return {
    status: "connecting",
    stages,
    transcript: null,
    media: null,
    errorCode: null,
    replayed: false,
    lastSeq: -1,
  };
}

function activeStage(state: DropEventsState): StageKey | null {
  return STAGES.find(({ key }) => state.stages[key].status === "active")?.key ?? null;
}

function closeActive(state: DropEventsState, t: number, status: StageStatus) {
  const key = activeStage(state);
  if (!key) return state.stages;
  return { ...state.stages, [key]: { ...state.stages[key], status, endT: t } };
}

export function dropEventsReducer(state: DropEventsState, action: Action): DropEventsState {
  if (action.type === "reset") return initialState();
  const { event, receivedAt } = action;
  // EventSource may reconnect and replay history; skip what we've already applied.
  if (!event.replayed && event.seq <= state.lastSeq) return state;
  const next = { ...state, lastSeq: event.replayed ? state.lastSeq : event.seq };

  switch (event.kind) {
    case "stage": {
      const stages = closeActive(next, event.t, "done");
      return {
        ...next,
        status: "running",
        stages: {
          ...stages,
          [event.stage]: {
            status: "active",
            startT: event.t,
            receivedAt,
            detail: event.detail ?? undefined,
          },
        },
      };
    }
    case "detail": {
      const key = activeStage(next);
      if (!key) return next;
      return {
        ...next,
        stages: { ...next.stages, [key]: { ...next.stages[key], detail: event.detail } },
      };
    }
    case "media":
      return {
        ...next,
        media: { duration_s: event.duration_s, width: event.width, height: event.height },
      };
    case "transcript":
      return { ...next, transcript: event.lines };
    case "done": {
      const stages = closeActive(next, event.t, "done");
      const all = Object.fromEntries(
        Object.entries(stages).map(([k, s]) => [k, { ...s, status: "done" as const }]),
      ) as Record<StageKey, StageState>;
      return { ...next, status: "done", stages: all, replayed: Boolean(event.replayed) };
    }
    case "error": {
      let stages = closeActive(next, event.t, "error");
      if (!activeStage(next) && event.stage && event.stage in stages) {
        stages = { ...stages, [event.stage]: { ...stages[event.stage], status: "error" } };
      }
      return {
        ...next,
        status: "error",
        stages,
        errorCode: event.code,
        replayed: Boolean(event.replayed),
      };
    }
  }
}

/** Subscribes to a drop's SSE stream. Bump `attempt` to reconnect after a retry. */
export function useDropEvents(dropId: string, attempt = 0): DropEventsState {
  const [state, dispatch] = useReducer(dropEventsReducer, undefined, initialState);

  useEffect(() => {
    dispatch({ type: "reset" });
    const source = new EventSource(api.eventsUrl(dropId));
    source.onmessage = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as Envelope;
      dispatch({ type: "event", event, receivedAt: Date.now() });
      if (event.kind === "done" || event.kind === "error") source.close();
    };
    return () => source.close();
  }, [dropId, attempt]);

  return state;
}
