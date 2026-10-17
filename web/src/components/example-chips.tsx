"use client";

import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { errorCopy } from "@/lib/errors";
import { SOURCES } from "@/components/source-badge";
import type { SourceType } from "@/lib/sources";

function SourceIcon({ type }: { type: SourceType }) {
  const { icon: Icon, label } = SOURCES[type];
  return <Icon aria-label={label} />;
}

/** DESIGN §6.1 "Try an example": pre-processed runs, so they work without model quota. */
export function ExampleChips() {
  const router = useRouter();
  const examples = useQuery({ queryKey: ["examples"], queryFn: api.listExamples });
  const [pending, setPending] = useState<string | null>(null);

  if (!examples.data?.length) return null;

  async function open(slug: string) {
    setPending(slug);
    try {
      const { drop_id } = await api.createExampleDrop(slug);
      router.push(`/drops/${drop_id}`);
    } catch (err) {
      toast.error(errorCopy(err instanceof ApiError ? err.code : null).title);
      setPending(null);
    }
  }

  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <p className="text-muted-foreground text-xs">Or try an example</p>
      <div className="flex flex-wrap justify-center gap-2">
        {examples.data.map((ex) => (
          <Button
            key={ex.slug}
            variant="outline"
            size="sm"
            className="rounded-full"
            disabled={pending !== null}
            onClick={() => void open(ex.slug)}
            title={ex.title}
          >
            {pending === ex.slug ? (
              <Loader2 className="animate-spin" />
            ) : (
              <SourceIcon type={ex.source_type} />
            )}
            {ex.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
