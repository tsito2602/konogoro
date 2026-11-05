import { useCallback } from "react";

// Keep fixed/sticky siblings clear when text scaling changes a control's height.
export function useMeasuredHeight(property: `--${string}`) {
  return useCallback(
    (element: HTMLElement | null) => {
      const parent = element?.parentElement;
      if (!element || !parent) return;
      const previous = parent.style.getPropertyValue(property);
      const measure = () => parent.style.setProperty(property, `${element.getBoundingClientRect().height}px`);
      measure();
      const observer = new ResizeObserver(measure);
      // border-box で見る。ドックの高さは下の安全領域の padding を含むので、iPhone のホーム画面アプリで
      // 起動後に安全領域が変わっても content-box は変わらず、古い高さのままになっていた。
      observer.observe(element, { box: "border-box" });
      return () => {
        observer.disconnect();
        if (previous) parent.style.setProperty(property, previous);
        else parent.style.removeProperty(property);
      };
    },
    [property],
  );
}
