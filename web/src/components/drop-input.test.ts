import { describe, expect, it } from "vitest";

import { detectSource } from "@/lib/sources";

import { linkError, validateUpload } from "./drop-input";

describe("link validation", () => {
  it("detects supported platforms", () => {
    expect(detectSource("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(detectSource("https://www.tiktok.com/@coach/video/1")).toBe("tiktok");
    expect(detectSource("https://youtu.be/xyz")).toBe("youtube");
    expect(detectSource("https://m.youtube.com/watch?v=xyz")).toBe("youtube");
  });

  it("rejects unsupported or malformed links", () => {
    expect(detectSource("https://vimeo.com/1")).toBeNull();
    expect(detectSource("https://notyoutube.com/x")).toBeNull();
    expect(detectSource("youtube.com/watch")).toBeNull();
    expect(linkError("https://vimeo.com/1")).toMatch(/Instagram, TikTok or YouTube/);
    expect(linkError("")).toBeNull();
  });
});

describe("upload validation", () => {
  const file = (name: string) => new File(["x"], name, { type: "video/mp4" });

  it("accepts short mp4/mov clips", () => {
    expect(validateUpload(file("clip.MP4"), 42)).toBeNull();
    expect(validateUpload(file("clip.mov"), null)).toBeNull();
  });

  it("rejects other formats and clips over 3 minutes", () => {
    expect(validateUpload(file("notes.pdf"), null)).toMatch(/mp4 or mov/);
    expect(validateUpload(file("long.mp4"), 181)).toMatch(/3 minutes/);
  });
});
