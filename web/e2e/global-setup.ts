import { execFileSync } from "node:child_process";

export const CLIP = "/tmp/drop2list-e2e-clip.mp4";

/** A short synthetic clip (test pattern + tone); the fixture supplies the "speech". */
export default function globalSetup() {
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "testsrc=size=360x640:rate=15:duration=6",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:duration=6",
    "-shortest",
    "-pix_fmt",
    "yuv420p",
    CLIP,
  ]);
}
