import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Drop2List: turn any video into a bookable listing";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "space-between",
          backgroundColor: "#09090b",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
          color: "#fafafa",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Subtle background glow */}
        <div
          style={{
            position: "absolute",
            top: "-150px",
            right: "-150px",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(147, 51, 234, 0.25) 0%, rgba(219, 39, 119, 0.1) 60%, transparent 80%)",
            filter: "blur(60px)",
          }}
        />

        {/* Top: Logo & Eyebrow */}
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #8b5cf6, #ec4899)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 8px 24px rgba(139, 92, 246, 0.35)",
            }}
          >
            <div
              style={{
                width: "0",
                height: "0",
                borderTop: "8px solid transparent",
                borderBottom: "8px solid transparent",
                borderLeft: "14px solid white",
                marginLeft: "3px",
              }}
            />
          </div>
          <span style={{ fontSize: "28px", fontWeight: "700", letterSpacing: "-0.03em" }}>
            Drop2List
          </span>
          <span
            style={{
              marginLeft: "12px",
              fontSize: "14px",
              fontWeight: "600",
              color: "#a1a1aa",
              backgroundColor: "#27272a",
              padding: "4px 12px",
              borderRadius: "9999px",
            }}
          >
            Proof of Work · Xuman.AI
          </span>
        </div>

        {/* Middle: Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxWidth: "950px" }}>
          <h1
            style={{
              fontSize: "64px",
              fontWeight: "800",
              lineHeight: 1.08,
              letterSpacing: "-0.04em",
              margin: 0,
            }}
          >
            Turn any video into a{" "}
            <span
              style={{
                backgroundImage: "linear-gradient(135deg, #a78bfa, #f472b6)",
                backgroundClip: "text",
                color: "transparent",
              }}
            >
              bookable
            </span>{" "}
            listing.
          </h1>
          <p
            style={{
              fontSize: "24px",
              color: "#a1a1aa",
              lineHeight: 1.4,
              margin: 0,
              maxWidth: "850px",
            }}
          >
            Whisper transcription, Gemini structured extraction, youth-safety guardrails, and a
            swipeable instant-booking preview in under 30 seconds.
          </p>
        </div>

        {/* Bottom: Feature badges */}
        <div style={{ display: "flex", gap: "12px" }}>
          {[
            "1-LLM Budget Design",
            "Youth-Safety Flags & Quotes",
            "Swipe-to-Book Preview",
            "26-Video Evaluation Suite",
          ].map((tag) => (
            <div
              key={tag}
              style={{
                fontSize: "14px",
                color: "#d4d4d8",
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                padding: "8px 16px",
                borderRadius: "8px",
                fontWeight: "500",
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
