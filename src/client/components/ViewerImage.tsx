import { useState } from "react";
import { ErrorState, Loading } from "./AsyncState";
import "./ViewerImage.css";

export type ViewerImageTransform = {
  scale: number;
  x: number;
  y: number;
};

// A keyed image keeps late load/error events from changing a newer selection.
export function ViewerImage({
  src,
  alt,
  transform,
  interacting,
}: {
  src: string;
  alt: string;
  transform: ViewerImageTransform;
  interacting: boolean;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  return (
    <div
      className={`viewer-image${transform.scale > 1 ? " zoomed" : ""}${interacting ? " interacting" : ""}`}
      aria-busy={status === "loading"}
    >
      <img
        key={attempt}
        ref={(element) => {
          if (element?.complete && element.naturalWidth > 0) setStatus("ready");
        }}
        src={src}
        alt={alt}
        draggable={false}
        style={{
          visibility: status === "ready" ? "visible" : "hidden",
          transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
        }}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
      {status !== "ready" && (
        <div className="viewer-image-status">
          {status === "loading" ? (
            <Loading />
          ) : (
            <ErrorState
              message="写真を読み込めませんでした"
              retry={() => {
                setStatus("loading");
                setAttempt((value) => value + 1);
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
