"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Loader2, Save } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FormProvider, useForm, useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { JsonViewer } from "@/components/json-viewer";
import { ListingForm, type FieldMeta } from "@/components/listing-form";
import { ListingSidePanel, PreviewCard } from "@/components/listing-side-panel";
import { SafetyPanel } from "@/components/safety-panel";
import { StatusBadge } from "@/components/status-badge";
import { TranscriptList } from "@/components/transcript-list";
import { FrameStrip } from "@/components/frame-strip";
import { VideoPanel } from "@/components/video-panel";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUpdateListing } from "@/hooks/use-listing";
import { useEditorLayout } from "@/hooks/use-media-query";
import { api, apiUrl, ApiError, type DropInfo } from "@/lib/api";
import { errorCopy } from "@/lib/errors";
import {
  buildPatch,
  listingFormSchema,
  toFormValues,
  type ListingFormValues,
} from "@/lib/listing-form";
import type { Listing } from "@/lib/schema";

/** True if any leaf in RHF's dirtyFields tree is true. */
export function anyDirty(node: unknown): boolean {
  if (typeof node === "boolean") return node;
  if (Array.isArray(node)) return node.some(anyDirty);
  if (node && typeof node === "object") return Object.values(node).some(anyDirty);
  return false;
}

function at(tree: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], tree);
}

function InlineTitle() {
  const [editing, setEditing] = useState(false);
  const title = useWatch<ListingFormValues, "title">({ name: "title" });
  if (editing) {
    return <FormTitleInput onDone={() => setEditing(false)} />;
  }
  return (
    <h1 className="min-w-0 text-2xl font-semibold tracking-tight md:text-3xl">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="hover:bg-accent -mx-1 max-w-full truncate rounded-md px-1 text-left transition-colors duration-150"
        title="Click to edit the title"
      >
        {title || "Untitled listing"}
      </button>
    </h1>
  );
}

function FormTitleInput({ onDone }: { onDone: () => void }) {
  const { register } = useFormContext<ListingFormValues>();
  const { ref, onBlur, ...rest } = register("title");
  return (
    <Input
      {...rest}
      ref={(el) => {
        ref(el);
        el?.focus();
      }}
      onBlur={(e) => {
        void onBlur(e);
        onDone();
      }}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), onDone())}
      aria-label="Title"
      maxLength={80}
      className="h-11 text-xl font-semibold md:text-2xl"
    />
  );
}

export function ListingEditor({ listing, drop }: { listing: Listing; drop: DropInfo | undefined }) {
  const layout = useEditorLayout();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const savedEdits = useRef(new Set<string>());
  const update = useUpdateListing(listing.id);

  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: toFormValues(listing),
    mode: "onChange",
  });
  const { dirtyFields, isDirty } = form.formState;
  const availability = useWatch({ control: form.control, name: "availability" });
  const thumbnail = useWatch({ control: form.control, name: "thumbnail_frame" });

  const isEdited = (key: string) => savedEdits.current.has(key) || anyDirty(at(dirtyFields, key));
  const meta: FieldMeta = { confidence: listing.confidence, isEdited };
  const missing = listing.missing_fields.filter((f) =>
    f === "availability" ? !availability?.length : !isEdited(f),
  );

  const save = form.handleSubmit(async (values) => {
    const dirty = form.formState.dirtyFields;
    const keys = Object.keys(dirty).filter((k) => anyDirty(dirty[k as keyof typeof dirty]));
    if (keys.length === 0) return;
    try {
      const updated = await update.mutateAsync(buildPatch(values, keys));
      for (const key of Object.keys(listing.confidence)) {
        if (anyDirty(at(dirty, key))) savedEdits.current.add(key);
      }
      form.reset(toFormValues(updated));
      toast.success("Saved");
    } catch (err) {
      const copy = errorCopy(err instanceof ApiError ? err.code : null);
      toast.error(
        err instanceof ApiError && err.code === "LISTING_INVALID" ? err.message : copy.title,
      );
    }
  });
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seek = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = seconds;
    // From the Safety tab the video may be off screen (or behind the preview sheet).
    const box = video.getBoundingClientRect();
    if (box.bottom < 0 || box.top > window.innerHeight) {
      video.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    void video.play().catch(() => undefined);
  };

  const evidenceTimes = listing.guardrails.flags.flatMap((f) =>
    f.timestamp_s != null ? [f.timestamp_s] : [],
  );

  const videoPanel = (
    <VideoPanel
      videoRef={videoRef}
      src={drop?.media_url ? apiUrl(drop.media_url) : null}
      captionsSrc={api.captionsUrl(listing.id)}
      poster={thumbnail ? apiUrl(`/api/media/${listing.id}/${thumbnail}`) : null}
      width={drop?.width}
      height={drop?.height}
      sourceType={listing.source.type}
      durationS={listing.source.duration_s}
      onTimeUpdate={setCurrentTime}
    >
      <FrameStrip
        dropId={listing.id}
        frames={drop?.frames ?? null}
        selected={thumbnail}
        onSelect={(file) => form.setValue("thumbnail_frame", file, { shouldDirty: true })}
        portrait={drop?.width && drop.height ? drop.height >= drop.width : true}
      />
    </VideoPanel>
  );
  const transcript = (
    <TranscriptList
      lines={listing.transcript}
      currentTime={currentTime}
      evidenceTimes={evidenceTimes}
      onSeek={seek}
    />
  );
  const transcriptCard = (
    <Card className="gap-3 p-4">
      <h2 className="text-lg font-semibold">Transcript</h2>
      {transcript}
    </Card>
  );
  const formEl = <ListingForm meta={meta} missingFields={missing} />;
  const side = <ListingSidePanel listing={listing} onSeek={seek} />;

  let body;
  if (layout === "xl") {
    body = (
      <div className="grid grid-cols-[320px_1fr_380px] items-start gap-8">
        <div className="sticky top-20 space-y-4">
          {videoPanel}
          {transcriptCard}
        </div>
        {formEl}
        <div className="sticky top-20">{side}</div>
      </div>
    );
  } else if (layout === "lg") {
    body = (
      <div className="space-y-6">
        <Accordion type="single" collapsible className="bg-card rounded-xl border px-4">
          <AccordionItem value="source" className="border-b-0">
            <AccordionTrigger>Source video &amp; transcript</AccordionTrigger>
            <AccordionContent className="grid grid-cols-[280px_1fr] gap-6">
              {videoPanel}
              {transcript}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        <div className="grid grid-cols-[1fr_380px] items-start gap-8">
          {formEl}
          <div className="sticky top-20">{side}</div>
        </div>
      </div>
    );
  } else if (layout === "md") {
    body = (
      <div className="grid grid-cols-[280px_1fr] items-start gap-6">
        <div className="sticky top-20 space-y-4">
          {videoPanel}
          {transcriptCard}
        </div>
        {formEl}
        <Sheet>
          <SheetTrigger asChild>
            <Button
              size="lg"
              className="fixed right-6 bottom-6 z-30 rounded-full shadow-2xl shadow-primary/10"
            >
              <Eye /> Preview
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[420px] overflow-y-auto sm:max-w-[420px]">
            <SheetHeader>
              <SheetTitle>Preview &amp; safety</SheetTitle>
            </SheetHeader>
            <div className="px-4 pb-6">{side}</div>
          </SheetContent>
        </Sheet>
      </div>
    );
  } else {
    body = (
      <div className="space-y-4">
        {videoPanel}
        <Accordion type="single" collapsible className="bg-card rounded-xl border px-4">
          <AccordionItem value="transcript" className="border-b-0">
            <AccordionTrigger>Transcript</AccordionTrigger>
            <AccordionContent>{transcript}</AccordionContent>
          </AccordionItem>
        </Accordion>
        <Tabs defaultValue="form">
          <TabsList className="w-full">
            <TabsTrigger value="form">Form</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="safety">Safety ({listing.guardrails.flags.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="form" className="mt-4">
            {formEl}
          </TabsContent>
          <TabsContent value="preview" className="mt-4">
            <PreviewCard listing={listing} />
          </TabsContent>
          <TabsContent value="safety" className="mt-4">
            <SafetyPanel guardrails={listing.guardrails} onSeek={seek} />
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-6 pt-6 md:pt-8"
      >
        <div className="space-y-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/listings">Listings</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem className="min-w-0">
                <BreadcrumbPage className="truncate">{listing.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="min-w-0 flex-1">
              <InlineTitle />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={listing.guardrails.status} />
              <JsonViewer data={listing} />
              <Button type="submit" disabled={!isDirty || update.isPending}>
                {update.isPending ? <Loader2 className="animate-spin" /> : <Save />}
                Save
                <kbd className="text-primary-foreground/70 hidden font-mono text-[10px] lg:inline">
                  ⌘S
                </kbd>
              </Button>
            </div>
          </div>
        </div>
        {body}
      </form>
    </FormProvider>
  );
}
