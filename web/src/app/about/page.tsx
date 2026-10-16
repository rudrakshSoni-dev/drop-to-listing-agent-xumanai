import type { Metadata } from "next";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <div className="max-w-prose space-y-4 pt-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">About Drop2List</h1>
      <p className="text-muted-foreground text-sm md:text-base">
        Drop2List turns a short video from a tutor, coach, or mentor into a structured, bookable
        service listing. It transcribes the clip, extracts the service with an LLM, scores its
        confidence, and flags youth-safety risks for review.
      </p>
      <p className="text-muted-foreground text-sm md:text-base">
        Marketplaces live or die on supply. The slowest part of onboarding a provider is getting a
        good listing out of them; most already describe their service on video.
      </p>
    </div>
  );
}
