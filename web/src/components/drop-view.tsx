"use client";

import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { EditorSkeleton } from "@/components/editor-skeleton";
import { ErrorState } from "@/components/error-state";
import { ListingEditor } from "@/components/listing-editor";
import { PipelineStepper } from "@/components/pipeline-stepper";
import { TranscriptList } from "@/components/transcript-list";
import { VideoPanel } from "@/components/video-panel";
import { Card } from "@/components/ui/card";
import { useDropEvents } from "@/hooks/use-drop-events";
import { useListing } from "@/hooks/use-listing";
import { api, apiUrl, ApiError } from "@/lib/api";
import { errorCopy } from "@/lib/errors";

export function DropView({ id }: { id: string }) {
  const reduceMotion = useReducedMotion();
  const [attempt, setAttempt] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const events = useDropEvents(id, attempt);
  const drop = useQuery({ queryKey: ["drop", id], queryFn: () => api.getDrop(id) });
  const listing = useListing(id, events.status === "done");
  const videoRef = useRef<HTMLVideoElement>(null);
  const toasted = useRef(false);

  useEffect(() => {
    if (events.status === "done" && !events.replayed && !toasted.current) {
      toasted.current = true;
      toast.success("Listing ready ✓");
    }
  }, [events.status, events.replayed]);

  async function retry() {
    setRetrying(true);
    try {
      await api.retryDrop(id);
      setAttempt((a) => a + 1);
    } catch (err) {
      toast.error(errorCopy(err instanceof ApiError ? err.code : null).title);
    } finally {
      setRetrying(false);
    }
  }

  if (drop.error) {
    const code = drop.error instanceof ApiError ? drop.error.code : null;
    return (
      <div className="mx-auto max-w-xl pt-16">
        <ErrorState code={code} onRetry={() => void drop.refetch()} />
      </div>
    );
  }

  const ready = events.status === "done" && listing.data;
  const fade = reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4 };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {ready ? (
        <motion.div
          key="editor"
          initial={fade}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ListingEditor listing={listing.data} drop={drop.data} />
        </motion.div>
      ) : events.status === "done" && listing.isError ? (
        <div className="mx-auto max-w-xl pt-16">
          <ErrorState code="INTERNAL" onRetry={() => void listing.refetch()} />
        </div>
      ) : events.status === "done" && events.replayed ? (
        <EditorSkeleton key="skeleton" />
      ) : (
        <motion.div
          key="processing"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="grid gap-8 pt-6 md:pt-8 lg:grid-cols-[1fr_420px]"
        >
          <div className="min-w-0 space-y-4">
            <VideoPanel
              videoRef={videoRef}
              src={drop.data?.media_url ? apiUrl(drop.data.media_url) : null}
              width={events.media?.width ?? drop.data?.width}
              height={events.media?.height ?? drop.data?.height}
              sourceType={drop.data?.source.type ?? "upload"}
              durationS={events.media?.duration_s ?? drop.data?.duration_s}
            />
            <Card className="gap-3 p-4">
              <h2 className="text-lg font-semibold">Transcript</h2>
              <TranscriptList
                lines={events.transcript}
                onSeek={(t) => {
                  if (videoRef.current) videoRef.current.currentTime = t;
                }}
              />
            </Card>
          </div>
          <div className="lg:sticky lg:top-20 lg:self-start">
            {events.status === "error" ? (
              <ErrorState
                code={events.errorCode}
                onRetry={() => void retry()}
                retrying={retrying}
              />
            ) : (
              <Card className="p-4 md:p-6">
                <PipelineStepper state={events} />
              </Card>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
