import { describe, expect, it } from "vitest";
import { stableHash } from "./preview";

describe("preview cache keys", () => {
  it("changes when a source fingerprint changes", () => {
    expect(stableHash("asset-1:size:100:mtime:1")).not.toBe(
      stableHash("asset-1:size:100:mtime:2")
    );
  });

  it("is deterministic for equivalent input", () => {
    expect(stableHash("project:7|revision:3|source:a")).toBe(
      stableHash("project:7|revision:3|source:a")
    );
  });
});
