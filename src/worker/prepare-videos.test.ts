import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { playbackManifestSchema } from "../shared/video-playback";

const hasFfmpeg = spawnSync("ffmpeg", ["-version"]).status === 0 && spawnSync("ffprobe", ["-version"]).status === 0;

describe("PC動画準備コマンド", () => {
  it.skipIf(!hasFfmpeg)(
    "実際の映像・音声を変換し、元動画を維持してH.264/AACとfaststartを生成する",
    () => {
      const directory = mkdtempSync(path.join(tmpdir(), "konogoro-playback-"));
      try {
        const source = path.join(directory, "source.mp4");
        const output = path.join(directory, "prepared");
        const generated = spawnSync("ffmpeg", [
          "-v",
          "error",
          "-f",
          "lavfi",
          "-i",
          "color=c=blue:size=2048x1152:rate=30",
          "-f",
          "lavfi",
          "-i",
          "sine=frequency=440:sample_rate=44100",
          "-t",
          "0.4",
          "-c:v",
          "libx264",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          source,
        ]);
        expect(generated.status, generated.stderr?.toString()).toBe(0);
        const hash = () => createHash("sha256").update(readFileSync(source)).digest("hex");
        const before = hash();
        const prepared = spawnSync(process.execPath, ["scripts/prepare-videos.mjs", "--output", output, source], {
          encoding: "utf8",
        });
        expect(prepared.status, prepared.stderr).toBe(0);
        const manifest = playbackManifestSchema.parse(
          JSON.parse(readFileSync(path.join(output, "konogoro-videos.json"), "utf8")),
        );
        const entry = manifest.entries[0];
        expect(entry.original.sha256).toBe(before);
        expect(hash()).toBe(before);
        expect(entry.playback).toMatchObject({
          width: 1920,
          height: 1080,
          videoCodec: "h264",
          audioCodec: "aac",
          faststart: true,
        });
        const bytes = readFileSync(path.join(output, entry.playback.filename));
        expect(entry.playback.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));
        const atoms: string[] = [];
        for (let offset = 0; offset + 8 <= bytes.length;) {
          atoms.push(new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8)));
          const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
          if (size < 8) break;
          offset += size;
        }
        expect(atoms).toContain("moov");
        expect(atoms.indexOf("moov")).toBeLessThan(atoms.indexOf("mdat"));
        // A retry against an existing output directory never replaces its artifacts.
        const repeated = spawnSync(process.execPath, ["scripts/prepare-videos.mjs", "--output", output, source]);
        expect(repeated.status).not.toBe(0);
        expect(hash()).toBe(before);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );

  it.skipIf(!hasFfmpeg)(
    "音声のない縦動画は縦横比を保ち、無音のまま変換できる",
    () => {
      const directory = mkdtempSync(path.join(tmpdir(), "konogoro-portrait-"));
      try {
        const source = path.join(directory, "portrait.mp4");
        const output = path.join(directory, "prepared");
        expect(
          spawnSync("ffmpeg", [
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=red:size=1152x2048:rate=30",
            "-t",
            "0.2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            source,
          ]).status,
        ).toBe(0);
        const result = spawnSync(process.execPath, ["scripts/prepare-videos.mjs", "--output", output, source]);
        expect(result.status, result.stderr?.toString()).toBe(0);
        const { entries } = playbackManifestSchema.parse(
          JSON.parse(readFileSync(path.join(output, "konogoro-videos.json"), "utf8")),
        );
        expect(entries[0].playback).toMatchObject({ width: 1080, height: 1920, audioCodec: null });
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
