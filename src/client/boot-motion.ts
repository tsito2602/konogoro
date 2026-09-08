export const bootMotionDuration = 900;

export function bootMotionElapsed(): number {
  if (typeof performance === "undefined") return 0;
  const start = performance.getEntriesByName("konogoro-boot")[0]?.startTime;
  return start === undefined ? 0 : Math.max(0, performance.now() - start);
}

export function bootMotionRemaining(elapsed: number, standalone: boolean, reducedMotion: boolean): number {
  return standalone && !reducedMotion ? Math.max(0, bootMotionDuration - elapsed) : 0;
}

export function remainingBootMotion(): number {
  if (typeof document === "undefined") return 0;
  return bootMotionRemaining(
    bootMotionElapsed(),
    document.documentElement.classList.contains("standalone"),
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
}
