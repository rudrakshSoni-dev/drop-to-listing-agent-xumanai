import type { GuardrailFlag, Listing } from "@/lib/schema";

/** Human copy for each guardrail code (CLAUDE.md §5). Unknown codes fall back gracefully. */
export const FLAG_INFO: Record<string, { name: string; fix: string }> = {
  OFF_PLATFORM_CONTACT: {
    name: "Off-platform contact",
    fix: "Remove phone numbers, emails, websites and handles from the listing. Bookings and messages stay on the platform; if the video itself says them, re-record or ask for a manual review.",
  },
  PRIVATE_MEETING_MINOR: {
    name: "Private 1:1 meeting with a minor",
    fix: "Meet in a public or supervised place, or say that a parent or guardian is present.",
  },
  UNVERIFIED_CREDENTIAL: {
    name: "Unverified credential",
    fix: "Add checkable detail (where, when, which body) or remove the claim.",
  },
  AGE_MISMATCH: {
    name: "Content may not suit the ages",
    fix: "Adjust the age range or the content so they match.",
  },
  GUARANTEED_OUTCOME: {
    name: "Guaranteed outcome",
    fix: 'Describe what learners work on instead of promising results ("practice exam papers" rather than "guaranteed A+").',
  },
  UNSAFE_ACTIVITY: {
    name: "Physical activity without safety info",
    fix: "Mention supervision, warm-ups and any safety equipment.",
  },
};

export function flagInfo(code: string) {
  return (
    FLAG_INFO[code] ?? { name: code.replaceAll("_", " ").toLowerCase(), fix: "Review this item." }
  );
}

export const STATUS_COPY: Record<Listing["guardrails"]["status"], { title: string; line: string }> =
  {
    pass: {
      title: "No flags",
      line: "Nothing was flagged for review. A person should still check listings for minors.",
    },
    warn: {
      title: "Flagged for review",
      line: "You can save and publish, but review these items first.",
    },
    block: {
      title: "Not publishable yet",
      line: "High-severity items need to be resolved before this listing can be booked.",
    },
  };

export const SEVERITY_LABELS: Record<GuardrailFlag["severity"], string> = {
  high: "High",
  med: "Medium",
  low: "Low",
};
