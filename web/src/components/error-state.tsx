"use client";

import { AlertCircle, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { errorCopy } from "@/lib/errors";

export function ErrorState({
  code,
  onRetry,
  retrying = false,
}: {
  code: string | null | undefined;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const copy = errorCopy(code);
  return (
    <Alert variant="destructive" className="rounded-xl">
      <AlertCircle aria-hidden />
      <AlertTitle>{copy.title}</AlertTitle>
      <AlertDescription className="gap-4">
        <p>{copy.description}</p>
        <div className="flex flex-wrap gap-2">
          {onRetry && copy.retryable && (
            <Button size="sm" onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              Retry
            </Button>
          )}
          <Button size="sm" variant="outline" asChild>
            <Link href="/">Start over</Link>
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
