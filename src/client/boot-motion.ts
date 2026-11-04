// index.html の起動の動き（名前が出そろうまで約1.6秒）と、ドックへ移る前のひと呼吸。
export const bootMotionDuration = 1760;

export function bootMotionElapsed(): number {
  if (typeof document === "undefined") return 0;
  // Use the actual animation clock, including delayed first paint on mobile.
  const sun = document.querySelector("#initial-boot .boot-sun");
  const time = sun?.getAnimations()[0]?.currentTime;
  return typeof time === "number" ? Math.max(0, time) : 0;
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
