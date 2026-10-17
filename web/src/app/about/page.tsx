import {
  ArrowRight,
  AudioLines,
  CalendarCheck,
  Download,
  FolderGit2,
  Image as ImageIcon,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "About" };

const PIPELINE_STAGES = [
  {
    title: "1. Fetch",
    tech: "yt-dlp · ffmpeg",
    desc: "Ingests public links or uploads; validates length (≤3m) and format.",
    icon: Download,
  },
  {
    title: "2. Transcribe",
    tech: "faster-whisper (small.en)",
    desc: "Extracts spoken audio locally to keep free-tier API costs at zero.",
    icon: AudioLines,
  },
  {
    title: "3. Key Frames",
    tech: "ffmpeg scene detection",
    desc: "Pulls 4–6 visual frames and scores an initial listing thumbnail.",
    icon: ImageIcon,
  },
  {
    title: "4. Extract",
    tech: "Gemini 2.5/3.x Flash",
    desc: "One structured LLM pass with transcript quotes and confidence scores.",
    icon: Sparkles,
  },
  {
    title: "5. Guardrails",
    tech: "Rules + LLM grounded",
    desc: "Flags off-platform contact, unverified claims, and youth risks.",
    icon: ShieldCheck,
  },
  {
    title: "6. Instant Book",
    tech: "Framer Motion + SQLite",
    desc: "Interactive swipe-to-book mobile card with slot validation.",
    icon: CalendarCheck,
  },
];

const STACK = [
  { category: "Web & UI", items: ["Next.js 15 App Router", "TypeScript", "Tailwind CSS", "shadcn/ui", "Framer Motion", "TanStack Query", "React Hook Form", "Zod"] },
  { category: "API & Pipeline", items: ["FastAPI", "Python 3.12", "Pydantic v2", "SQLModel (SQLite)", "faster-whisper", "ffmpeg", "yt-dlp", "Google Gemini API"] },
  { category: "Evaluation & Testing", items: ["26 Public Video Evals", "Vitest", "Playwright E2E", "Pytest", "Ruff", "Mypy (strict)"] },
];

const WHAT_ID_DO_WITH_REAL_DATA = [
  {
    title: "Calibrated Pricing Engine",
    desc: "Train an empirical pricing model using real marketplace transaction history, provider location, seasonality, and subject demand rather than static category heuristics.",
  },
  {
    title: "Moderation Audit Fine-Tuning",
    desc: "Fine-tune safety filters on real historical support logs to distinguish benign resource links (e.g. syllabus links) from predatory off-platform contact with minors.",
  },
  {
    title: "Taxonomy & Standardized Curricula Alignment",
    desc: "Map extracted skills directly into structured ontologies (Common Core, IB, AP, USSF) so parents can search by school grade standard rather than freeform keywords.",
  },
  {
    title: "Multi-Video Portfolio Aggregation",
    desc: "Cluster multiple drops from the same Guide to build comprehensive provider profiles, detecting consistent age groups, recurring formats, and verified specialties.",
  },
  {
    title: "Two-Way Calendar Sync & Dynamic Slots",
    desc: "Connect provider availability directly to Google and Apple Calendars via OAuth/CalDAV, auto-reconciling conflicting appointments and time zones.",
  },
];

export default function AboutPage() {
  return (
    <div className="space-y-12 pt-8">
      {/* Intro */}
      <section className="max-w-prose space-y-4">
        <Badge variant="secondary" className="rounded-full">
          Proof of Work · Xuman.AI Application
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
          Turn content into instant booking.
        </h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Marketplaces live or die on supply onboarding. The highest-friction step for coaches, tutors,
          and mentors is manually drafting listings, deciding pricing tiers, specifying age ranges,
          and outlining session formats.
        </p>
        <p className="text-muted-foreground text-base leading-relaxed">
          Yet almost every modern creator-educator already explains exactly what they teach in short-form
          video on Instagram Reels, TikTok, or YouTube Shorts. Drop2List collapses that 20-minute form into a
          30-second automated pipeline that produces a structured, safety-checked, bookable listing.
        </p>
      </section>

      {/* Pipeline Diagram */}
      <section className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">How it works: the 6-stage pipeline</h2>
          <p className="text-muted-foreground text-sm">
            Designed for free-tier sustainability: exactly 1 LLM request per video with local preprocessing.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {PIPELINE_STAGES.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <Card key={stage.title} className="relative flex flex-col justify-between p-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="bg-primary/10 text-primary flex size-8 items-center justify-center rounded-lg">
                      <Icon className="size-4" />
                    </div>
                    {i < PIPELINE_STAGES.length - 1 && (
                      <ArrowRight className="text-muted-foreground/40 hidden lg:block size-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{stage.title}</h3>
                    <p className="font-mono text-muted-foreground text-[11px]">{stage.tech}</p>
                  </div>
                  <p className="text-muted-foreground text-xs leading-normal">{stage.desc}</p>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Tech Stack */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold tracking-tight">Tech Stack</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {STACK.map((group) => (
            <Card key={group.category} className="p-4 space-y-3">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.category}
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <Badge key={item} variant="outline" className="rounded-md font-mono text-[11px]">
                    {item}
                  </Badge>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* What I'd do with real marketplace data */}
      <section className="space-y-4 max-w-3xl">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">
            What I&apos;d do with real marketplace data
          </h2>
          <p className="text-muted-foreground text-sm">
            Opportunities to scale this architecture with historical bookings, Guide feedback, and catalog signals.
          </p>
        </div>

        <div className="grid gap-3">
          {WHAT_ID_DO_WITH_REAL_DATA.map((item, index) => (
            <Card key={item.title} className="p-4">
              <div className="flex items-start gap-3">
                <span className="font-mono text-xs font-semibold text-primary mt-0.5">
                  0{index + 1}
                </span>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">{item.title}</h3>
                  <p className="text-muted-foreground text-xs leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Links & CTA */}
      <section className="pt-4 border-t flex flex-wrap items-center gap-4">
        <Button asChild variant="default">
          <Link href="/">
            Try the demo
            <ArrowRight className="ml-1 size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/evals">View Eval metrics</Link>
        </Button>
        <Button asChild variant="ghost" className="gap-2">
          <a
            href="https://github.com/rudraksh61/drop-to-listing-agent-xumanai"
            target="_blank"
            rel="noreferrer"
          >
            <FolderGit2 className="size-4" />
            GitHub Repository
          </a>
        </Button>
        <Button asChild variant="ghost" className="gap-2">
          <a href="mailto:rudraksh61@gmail.com">
            <Mail className="size-4" />
            Contact
          </a>
        </Button>
      </section>
    </div>
  );
}
