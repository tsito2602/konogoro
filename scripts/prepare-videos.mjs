import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const maxBytes = 500 * 1024 * 1024;

async function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let error = "";
    child.stdout.on("data", (data) => (output += data));
    child.stderr.on("data", (data) => (error = (error + data).slice(-4000)));
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve(output) : reject(new Error(`${command}: ${error}`))));
  });
}

async function sha256(filename) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest("hex");
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] !== "--output" || args.length < 3) {
    throw new Error('使い方: node scripts/prepare-videos.mjs --output "新しい出力フォルダ" "元動画.mp4" [...]');
  }
  const outputDirectory = path.resolve(args[1]);
  const inputs = [...new Set(args.slice(2).map((filename) => path.resolve(filename)))];
  if (inputs.length > 30) throw new Error("一度に準備できる動画は30本までです。");
  for (const input of inputs) {
    const source = await stat(input);
    if (!source.isFile() || source.size === 0 || source.size > maxBytes) {
      throw new Error(`${path.basename(input)}: 0バイトより大きい500MB以下の動画を指定してください。`);
    }
  }
  // Verify dependencies before making output; never overwrite or modify source files.
  await run("ffmpeg", ["-version"]);
  await run("ffprobe", ["-version"]);
  await mkdir(outputDirectory); // EEXIST is intentional: no accidental overwrites on retry.
  const entries = [];
  for (const input of inputs) {
    const sourceBefore = await stat(input);
    const originalSha256 = await sha256(input);
    const sourceInfo = JSON.parse(await run("ffprobe", ["-v", "error", "-show_streams", "-of", "json", input]));
    const sourceVideo = sourceInfo.streams.find((stream) => stream.codec_type === "video");
    if (!sourceVideo) throw new Error(`${path.basename(input)}: 動画トラックがありません。`);
    if (["smpte2084", "arib-std-b67"].includes(sourceVideo.color_transfer)) {
      throw new Error(`${path.basename(input)}: HDR動画は先にSDRへ変換してください。元動画は変更していません。`);
    }
    const filename = `${entries.length + 1}-${originalSha256.slice(0, 16)}.playback.mp4`;
    const output = path.join(outputDirectory, filename);
    process.stdout.write(`${path.basename(input)} を準備中…\n`);
    // Rotation metadata is applied by ffmpeg before this filter; fit both orientations.
    // min() prevents upscaling small sources; compatible with ffmpeg 5 and newer.
    const compatibleScale =
      "scale=w='min(iw,if(gte(iw,ih),1920,1080))':h='min(ih,if(gte(iw,ih),1080,1920))':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1";
    await run("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-n",
      "-i",
      input,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-map_metadata",
      "-1",
      "-vf",
      compatibleScale,
      "-r",
      "30",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "medium",
      "-crf",
      "23",
      "-maxrate",
      "5M",
      "-bufsize",
      "10M",
      "-g",
      "60",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      output,
    ]);
    const sourceAfter = await stat(input);
    if (
      sourceBefore.size !== sourceAfter.size ||
      sourceBefore.mtimeMs !== sourceAfter.mtimeMs ||
      originalSha256 !== (await sha256(input))
    ) {
      throw new Error(`${path.basename(input)}: 処理中に元動画が変更されたため取り込み用情報を作成できません。`);
    }
    const result = JSON.parse(
      await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", output]),
    );
    const video = result.streams.find((stream) => stream.codec_type === "video");
    const audio = result.streams.find((stream) => stream.codec_type === "audio");
    const playbackSize = (await stat(output)).size;
    if (playbackSize > maxBytes)
      throw new Error(`${filename}: 再生用動画が500MBを超えました。動画を短くして再実行してください。`);
    entries.push({
      original: { filename: path.basename(input), byteSize: sourceBefore.size, sha256: originalSha256 },
      playback: {
        filename,
        byteSize: playbackSize,
        sha256: await sha256(output),
        mimeType: "video/mp4",
        videoCodec: video.codec_name,
        audioCodec: audio?.codec_name ?? null,
        width: video.width,
        height: video.height,
        durationSeconds: Number(result.format.duration),
        faststart: true,
      },
    });
  }
  await writeFile(
    path.join(outputDirectory, "konogoro-videos.json"),
    JSON.stringify({ version: 1, entries }, null, 2) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    `完了: ${entries.length}本。アプリで元動画を選び、「再生用動画を取り込む」から出力フォルダ内の全ファイルを選択してください。\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
