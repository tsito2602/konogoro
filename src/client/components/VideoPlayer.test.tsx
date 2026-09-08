import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "./VideoPlayer";

const media = { src: "/sample.mp4", poster: "/sample.jpg" };

describe("VideoPlayer control ownership", () => {
  it("keeps native playback controls outside the viewer", () => {
    expect(renderToStaticMarkup(<VideoPlayer {...media} />)).toContain('controls=""');
  });

  it.each([true, false])("never combines native controls with viewer controls (visible=%s)", (visible) => {
    const html = renderToStaticMarkup(
      <VideoPlayer {...media} viewerControls={{ container: null, visible, toggle: vi.fn() }} />,
    );
    expect(html).not.toContain('controls=""');
    expect(html).not.toContain("動画を再生");
    expect(html).toContain(visible ? 'aria-label="操作表示を隠す"' : 'aria-label="操作表示を表示する"');
    // The tap surface has no visible restore label or icon.
    expect(html).toMatch(/class="video-overlay-surface"[^>]*><\/button>/);
  });

  it("disables the video tap surface while comments pause playback", () => {
    const html = renderToStaticMarkup(
      <VideoPlayer {...media} paused viewerControls={{ container: null, visible: false, toggle: vi.fn() }} />,
    );
    expect(html).not.toContain("video-overlay-surface");
    expect(html).not.toContain('controls=""');
  });
});
