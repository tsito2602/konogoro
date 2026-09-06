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
      observer.observe(element);
      return () => {
        observer.disconnect();
        if (previous) parent.style.setProperty(property, previous);
        else parent.style.removeProperty(property);
      };
    },
    [property],
  );
}
