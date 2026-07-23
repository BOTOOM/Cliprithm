import { describe, expect, it } from "vitest";
import { mediaServerUrl } from "./media";

describe("media server URLs", () => {
  it("includes the per-process token and encodes both query values", () => {
    const url = mediaServerUrl(43123, "token/with spaces", "/videos/my clip.mp4");
    const parsed = new URL(url);

    expect(parsed.origin).toBe("http://127.0.0.1:43123");
    expect(parsed.pathname).toBe("/stream");
    expect(parsed.searchParams.get("token")).toBe("token/with spaces");
    expect(parsed.searchParams.get("path")).toBe("/videos/my clip.mp4");
  });

  it("does not return a usable URL without authentication data", () => {
    expect(mediaServerUrl(43123, "", "/videos/source.mp4")).toBe("");
    expect(mediaServerUrl(0, "token", "/videos/source.mp4")).toBe("");
  });
});
