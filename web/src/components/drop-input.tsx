"use client";

import { ArrowRight, Film, Link2, Loader2, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";

import { SourceBadge } from "@/components/source-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { errorCopy } from "@/lib/errors";
import { timestamp } from "@/lib/format";
import { detectSource } from "@/lib/sources";
import { cn } from "@/lib/utils";

export const MAX_VIDEO_SECONDS = 180;
const ACCEPT = "video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm";

/** Reads a local video's duration via a detached <video> element. */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

export function validateUpload(file: File, duration: number | null): string | null {
  if (!/\.(mp4|mov|m4v|webm)$/i.test(file.name)) return "Upload an mp4 or mov file.";
  if (duration !== null && duration > MAX_VIDEO_SECONDS) {
    return `This clip is ${timestamp(duration)}. Videos up to 3 minutes for now.`;
  }
  return null;
}

export function linkError(value: string): string | null {
  if (!value.trim()) return null;
  return detectSource(value) ? null : "Paste a public Instagram, TikTok or YouTube link.";
}

export function DropInput() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"link" | "upload">("link");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<{
    file: File;
    duration: number | null;
    error: string | null;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const source = detectSource(url);
  const urlError = linkError(url);
  const valid = tab === "link" ? Boolean(source) : Boolean(file && !file.error);

  async function pick(f: File | undefined) {
    if (!f) return;
    const duration = await readDuration(f);
    setFile({ file: f, duration, error: validateUpload(f, duration) });
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    void pick(e.dataTransfer.files[0]);
  }

  async function submit() {
    if (!valid || submitting) return;
    setSubmitting(true);
    try {
      const { drop_id } =
        tab === "link"
          ? await api.createDropFromUrl(url.trim())
          : await api.createDropFromFile(file!.file);
      router.push(`/drops/${drop_id}`);
    } catch (err) {
      const copy = errorCopy(err instanceof ApiError ? err.code : null);
      toast.error(copy.title, { description: copy.description });
      setSubmitting(false);
    }
  }

  return (
    <Card className="mt-10 gap-0 p-4 text-left md:p-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Tabs value={tab} onValueChange={(v) => setTab(v as "link" | "upload")}>
          <TabsList className="w-full">
            <TabsTrigger value="link">
              <Link2 /> Paste link
            </TabsTrigger>
            <TabsTrigger value="upload">
              <Upload /> Upload video
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link" className="mt-4">
            <label htmlFor="drop-url" className="sr-only">
              Video link
            </label>
            <div className="relative">
              <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                id="drop-url"
                type="url"
                inputMode="url"
                autoComplete="off"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.instagram.com/reel/…"
                aria-invalid={Boolean(urlError)}
                aria-describedby={urlError ? "drop-url-error" : undefined}
                className={cn("h-12 rounded-lg pl-9 text-base md:text-base", source && "pr-32")}
              />
              {source && (
                <SourceBadge type={source} className="absolute top-1/2 right-3 -translate-y-1/2" />
              )}
            </div>
            {urlError && (
              <p id="drop-url-error" className="text-destructive mt-2 text-xs">
                {urlError}
              </p>
            )}
          </TabsContent>

          <TabsContent value="upload" className="mt-4">
            <input
              ref={fileInput}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => void pick(e.target.files?.[0])}
            />
            {file ? (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 text-center">
                <Film className="text-muted-foreground size-6" aria-hidden />
                <p className="max-w-full truncate text-sm font-medium">{file.file.name}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {(file.file.size / 1024 / 1024).toFixed(1)} MB
                  {file.duration !== null && ` · ${timestamp(file.duration)}`}
                </p>
                {file.error && <p className="text-destructive text-xs">{file.error}</p>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    if (fileInput.current) fileInput.current.value = "";
                  }}
                >
                  <X /> Choose another
                </Button>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInput.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    fileInput.current?.click();
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cn(
                  "focus-visible:ring-ring flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors duration-150 outline-none focus-visible:ring-2",
                  dragging ? "border-primary bg-primary/5" : "hover:border-muted-foreground/40",
                )}
              >
                <Upload className="text-muted-foreground size-6" aria-hidden />
                <p className="text-sm">Drop an mp4 or mov · max 3 min</p>
                <p className="text-muted-foreground text-xs">or click to choose a file</p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full rounded-lg"
          disabled={!valid || submitting}
        >
          {submitting && <Loader2 className="animate-spin" />}
          Generate listing
          {!submitting && <ArrowRight />}
        </Button>
        <p className="text-muted-foreground mt-3 text-center text-xs">
          Public videos only. Nothing is posted anywhere.
        </p>
      </form>
    </Card>
  );
}
