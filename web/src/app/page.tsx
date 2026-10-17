import { AudioLines, CalendarCheck, ShieldCheck } from "lucide-react";

import { DropInput } from "@/components/drop-input";
import { ExampleChips } from "@/components/example-chips";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

const STEPS = [
  {
    icon: AudioLines,
    title: "Understands",
    body: "Transcript + key frames, not just the caption.",
  },
  {
    icon: ShieldCheck,
    title: "Checks",
    body: "Flags off-platform contact and other youth-safety risks.",
  },
  { icon: CalendarCheck, title: "Books", body: "Preview it as a swipe-to-book card." },
];

export default function HomePage() {
  return (
    <div className="mx-auto max-w-2xl pt-16 text-center md:pt-24">
      <Badge variant="secondary" className="rounded-full">
        ✦ Content → bookable service
      </Badge>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight md:text-6xl">
        Turn any video into a <span className="text-brand-gradient">bookable</span> listing.
      </h1>
      <p className="text-muted-foreground mx-auto mt-5 max-w-prose text-sm md:text-base">
        Paste a Reel, TikTok or YouTube link. We transcribe it, understand the service, check it for
        youth-safety risks, and hand you a listing ready to book.
      </p>

      <DropInput />
      <ExampleChips />

      <section aria-labelledby="how-it-works" className="mt-20">
        <h2 id="how-it-works" className="sr-only">
          How it works
        </h2>
        <div className="grid gap-4 text-left md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }) => (
            <Card key={title} className="gap-2 p-4">
              <Icon className="text-primary size-5" aria-hidden />
              <h3 className="text-sm font-semibold">{title}</h3>
              <p className="text-muted-foreground text-sm">{body}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
