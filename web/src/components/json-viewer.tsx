"use client";

import { Braces, Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function JsonViewer({ data }: { data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Braces /> View JSON
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="flex-row items-center justify-between space-y-0 pr-12">
          <div>
            <SheetTitle>Listing JSON</SheetTitle>
            <SheetDescription>The saved listing, as the API returns it.</SheetDescription>
          </div>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy"}
          </Button>
        </SheetHeader>
        <ScrollArea className="min-h-0 flex-1 border-t">
          <pre className="p-4 font-mono text-xs leading-relaxed">{text}</pre>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
