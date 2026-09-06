import { describe, expect, it, vi } from "vitest";
import { uploadMissingParts } from "./upload-parts";

describe("uploadMissingParts", () => {
  it("成功した送信を保持し失敗した部分だけ再送する", async () => {
    const original = vi.fn().mockResolvedValue(undefined);
    const thumbnail = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    let done: string[] = [];
    const parts = [
      { key: "original", send: original },
      { key: "thumbnail", send: thumbnail },
    ];
    await expect(
      uploadMissingParts(parts, done, (keys) => {
        done = keys;
      }),
    ).rejects.toThrow();
    expect(done).toEqual(["original"]);
    await uploadMissingParts(parts, done, (keys) => {
      done = keys;
    });
    expect(original).toHaveBeenCalledTimes(1);
    expect(thumbnail).toHaveBeenCalledTimes(2);
    expect(done).toEqual(["original", "thumbnail"]);
  });
  it("確定だけ失敗した場合は全ファイルの再送を省く", async () => {
    const send = vi.fn();
    await uploadMissingParts([{ key: "original", send }], ["original"], () => {});
    expect(send).not.toHaveBeenCalled();
  });
});
