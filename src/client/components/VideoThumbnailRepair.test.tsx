import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Media } from "../../shared/types";
import { VideoThumbnailRepair } from "./VideoThumbnailRepair";

const media: Media = {
  id: "video-1",
  kind: "video",
  mimeType: "video/mp4",
  originalFilename: "sample.mp4",
  byteSize: 100,
  width: 480,
  height: 270,
  durationSeconds: 2,
  capturedAt: null,
  position: 0,
  contentUrl: "/video",
  thumbnailUrl: "/thumbnail",
  downloadUrl: "/download",
};
const callbacks = { onBusy: vi.fn(), onUpdated: vi.fn(), onMessage: vi.fn() };

describe("VideoThumbnailRepair", () => {
  it("renders an accessible icon without a separate list or a form submit action", () => {
    const html = renderToStaticMarkup(<VideoThumbnailRepair media={media} disabled={false} {...callbacks} />);
    expect(html).toContain('type="button"');
    expect(html).toContain('aria-label="sample.mp4のサムネイルを再生成"');
    expect(html).toContain('aria-busy="false"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("<section");
    expect(html).not.toContain('disabled=""');
  });
  it("disables regeneration when another edit operation is busy", () => {
    expect(renderToStaticMarkup(<VideoThumbnailRepair media={media} disabled {...callbacks} />)).toContain(
      'disabled=""',
    );
  });
  it("does not offer video regeneration on photos", () => {
    expect(
      renderToStaticMarkup(
        <VideoThumbnailRepair media={{ ...media, kind: "image" }} disabled={false} {...callbacks} />,
      ),
    ).toBe("");
  });
});
