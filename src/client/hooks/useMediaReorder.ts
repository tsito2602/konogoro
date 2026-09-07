import { useEffect, useRef, useState } from "react";
import { moveMediaItem } from "../media-order";

// Keep the real grid stable while dragging so moving siblings cannot change hit targets.
export function useMediaReorder(order: string[], onChange: (order: string[]) => void, disabled: boolean) {
  return useLongPressReorder(order, onChange, disabled, {
    itemSelector: "[data-media-id]",
    dataKey: "mediaId",
    dataAttribute: "data-media-id",
    reorderingClass: "media-reordering",
    placeholderClass: "media-drag-placeholder",
    previewClass: "media-drag-preview",
    interactiveSelector: "button, input, label, a",
  });
}

export function useSceneReorder(order: string[], onChange: (order: string[]) => void, disabled: boolean) {
  return useLongPressReorder(order, onChange, disabled, {
    itemSelector: "[data-scene-id]",
    dataKey: "sceneId",
    dataAttribute: "data-scene-id",
    reorderingClass: "scene-reordering",
    placeholderClass: "scene-drag-placeholder",
    previewClass: "scene-drag-preview",
    interactiveSelector: "input, a, label",
    handleSelector: "[data-scene-handle]",
  });
}

export function moveItemByOffset<T>(items: T[], index: number, offset: number): T[] {
  const destination = index + offset;
  if (destination < 0 || destination >= items.length) return items;
  const result = [...items];
  result.splice(destination, 0, ...result.splice(index, 1));
  return result;
}

type ReorderConfig = {
  itemSelector: string;
  dataKey: string;
  dataAttribute: string;
  reorderingClass: string;
  placeholderClass: string;
  previewClass: string;
  interactiveSelector: string;
  handleSelector?: string;
};

function useLongPressReorder(
  order: string[],
  onChange: (order: string[]) => void,
  disabled: boolean,
  config: ReorderConfig,
) {
  const gridRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  const onChangeRef = useRef(onChange);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    orderRef.current = order;
    onChangeRef.current = onChange;
  }, [order, onChange]);
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || disabled) return;
    let cleanupGesture: (() => void) | undefined;
    const start = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0 || cleanupGesture) return;
      const target = event.target as HTMLElement;
      if (config.handleSelector && !target.closest(config.handleSelector)) return;
      if (target.closest(config.interactiveSelector)) return;
      if (config.handleSelector) event.preventDefault();
      const source = target.closest<HTMLElement>(config.itemSelector);
      const sourceId = source?.dataset[config.dataKey];
      if (!source || !sourceId) return;
      const activeOrder = orderRef.current;
      const cards = [...grid.querySelectorAll<HTMLElement>(config.itemSelector)];
      const positions = cards.map((card) => card.getBoundingClientRect());
      const sourceIndex = cards.indexOf(source);
      const origin = positions[sourceIndex];
      const initialScroll = window.scrollY;
      let x = event.clientX;
      let y = event.clientY;
      let targetIndex = sourceIndex;
      let overlay: HTMLElement | undefined;
      let frame = 0;
      const update = () => {
        if (!overlay) return;
        const scrollDelta = window.scrollY - initialScroll;
        overlay.style.transform = `translate(${x - event.clientX}px, ${y - event.clientY}px) scale(${window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 1 : 1.03})`;
        // Clamp to the closest stable grid slot, including the final row and grid gaps.
        let distance = Infinity;
        positions.forEach((position, index) => {
          const next = Math.hypot(
            x - (position.left + position.width / 2),
            y - (position.top + position.height / 2 - scrollDelta),
          );
          if (next < distance) {
            distance = next;
            targetIndex = index;
          }
        });
        const preview = moveMediaItem(activeOrder, sourceId, cards[targetIndex].dataset[config.dataKey]!);
        cards.forEach((card, index) => {
          const destination = positions[preview.indexOf(card.dataset[config.dataKey]!)];
          if (destination)
            card.style.transform = `translate(${destination.left - positions[index].left}px, ${destination.top - positions[index].top}px)`;
        });
        const edge = 72;
        const speed =
          y < edge
            ? -Math.ceil((edge - y) / 6)
            : y > window.innerHeight - edge
              ? Math.ceil((y - window.innerHeight + edge) / 6)
              : 0;
        if (speed) window.scrollBy(0, Math.max(-16, Math.min(16, speed)));
        frame = requestAnimationFrame(update);
      };
      const activate = () => {
        overlay = source.cloneNode(true) as HTMLElement;
        overlay.removeAttribute(config.dataAttribute);
        overlay.removeAttribute("tabindex");
        overlay.setAttribute("aria-hidden", "true");
        overlay.classList.add(config.previewClass);
        Object.assign(overlay.style, {
          left: `${origin.left}px`,
          top: `${origin.top}px`,
          width: `${origin.width}px`,
          height: `${origin.height}px`,
        });
        document.body.append(overlay);
        source.classList.add(config.placeholderClass);
        grid.classList.add(config.reorderingClass);
        if (source.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
        window.getSelection()?.removeAllRanges();
        source.setPointerCapture(event.pointerId);
        setAnnouncement("移動中。指を離すと並び替え、Escapeでキャンセルできます。");
        update();
      };
      const timer = config.handleSelector ? undefined : window.setTimeout(activate, 350);
      const finish = (commit: boolean) => {
        const active = !!overlay;
        cleanupGesture?.();
        if (active && commit) {
          onChangeRef.current(moveMediaItem(activeOrder, sourceId, cards[targetIndex].dataset[config.dataKey]!));
          setAnnouncement(`${targetIndex + 1}番目に移動しました`);
        } else if (active) setAnnouncement("並び替えをキャンセルしました");
      };
      const move = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        x = next.clientX;
        y = next.clientY;
        if (!overlay && Math.hypot(x - event.clientX, y - event.clientY) > 8) finish(false);
        else if (overlay) next.preventDefault();
      };
      const up = (next: PointerEvent) => {
        if (next.pointerId !== event.pointerId) return;
        x = next.clientX;
        y = next.clientY;
        cancelAnimationFrame(frame);
        update();
        finish(true);
      };
      const cancel = () => finish(false);
      const key = (next: KeyboardEvent) => {
        if (next.key === "Escape") {
          next.preventDefault();
          cancel();
        }
      };
      const touch = (next: TouchEvent) => {
        if (overlay) next.preventDefault();
        if (next.touches.length > 1) cancel();
      };
      window.addEventListener("pointermove", move, { passive: false });
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
      window.addEventListener("blur", cancel);
      window.addEventListener("resize", cancel);
      window.addEventListener("keydown", key);
      grid.addEventListener("touchmove", touch, { passive: false });
      cleanupGesture = () => {
        cleanupGesture = undefined;
        clearTimeout(timer);
        cancelAnimationFrame(frame);
        overlay?.remove();
        source.classList.remove(config.placeholderClass);
        grid.classList.remove(config.reorderingClass);
        cards.forEach((card) => card.style.removeProperty("transform"));
        if (source.hasPointerCapture(event.pointerId)) source.releasePointerCapture(event.pointerId);
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        window.removeEventListener("blur", cancel);
        window.removeEventListener("resize", cancel);
        window.removeEventListener("keydown", key);
        grid.removeEventListener("touchmove", touch);
      };
      if (config.handleSelector) activate();
    };
    const context = (event: Event) => {
      if ((event.target as HTMLElement).closest(config.itemSelector)) event.preventDefault();
    };
    grid.addEventListener("pointerdown", start);
    grid.addEventListener("contextmenu", context);
    return () => {
      cleanupGesture?.();
      grid.removeEventListener("pointerdown", start);
      grid.removeEventListener("contextmenu", context);
    };
  }, [
    disabled,
    config.itemSelector,
    config.dataKey,
    config.dataAttribute,
    config.reorderingClass,
    config.placeholderClass,
    config.previewClass,
    config.interactiveSelector,
    config.handleSelector,
  ]);
  return { gridRef, announcement };
}
