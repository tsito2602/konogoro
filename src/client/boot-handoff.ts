// 起動画面からアプリへ移る動き。uchino・uchiwake の toDock と同じ流れで、
// 雲は上へ消え、山は地面へ沈み、太陽はかがんで跳んでから墨の玉になってドックへ落ち、横に広がってドックになる。
// 名前はぼけて消え、起動画面の背景が抜け、ページが少し下からせり上がり、玉が着いたところで本物のドックと＋が出る。

const UP = "cubic-bezier(.2,.8,.3,1)";
const DOWN_IN = "cubic-bezier(.5,0,.8,.4)";
const LAND = "cubic-bezier(.2,.7,.4,1)";
// 起動の動きと同じ「弾み弱め」と、全体を詰める倍率。
const AMP = 0.6;
const TIME = 0.75;
const bounce = (value: number) => value * AMP;
const squash = (value: number) => 1 + (value - 1) * AMP;
const ms = (value: number) => value * TIME;

type Box = { x: number; y: number; w: number; h: number };

let started = false;

function boxOf(element: Element): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
}

// ドックの島（cartoon-kit の .cdock-content の子）をまとめた外枠。
function dockBox(): Box | null {
  const host = document.querySelector(".main-dock-host");
  if (!host) return null;
  const islands = [...host.querySelectorAll(".cdock-content > [data-slot]")].map(boxOf).filter((box) => box.w > 0);
  if (!islands.length) {
    const dock = host.querySelector(".thumb-dock");
    const box = dock && boxOf(dock);
    return box && box.w > 0 ? box : null;
  }
  const left = Math.min(...islands.map((box) => box.x));
  const top = Math.min(...islands.map((box) => box.y));
  const right = Math.max(...islands.map((box) => box.x + box.w));
  const bottom = Math.max(...islands.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

const frame = (x: number, y: number, w: number, h: number) => ({
  left: `${x}px`,
  top: `${y}px`,
  width: `${w}px`,
  height: `${h}px`,
  borderRadius: `${Math.min(w, h) / 2}px`,
});

export function handOffInitialBoot(boot: HTMLElement) {
  if (started || boot.hidden) return;
  started = true;
  const hide = () => {
    boot.hidden = true;
  };
  const sun = boot.querySelector<SVGElement>(".boot-sun");
  const cloud = boot.querySelector<SVGElement>(".boot-cloud");
  const hills = [...boot.querySelectorAll<SVGElement>(".boot-hill, .boot-hill-gap")];
  const name = boot.querySelector<HTMLElement>(".boot-name");
  const dockHost = document.querySelector<HTMLElement>(".main-dock-host");
  const dock = dockBox();
  if (
    !document.documentElement.classList.contains("standalone") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    typeof boot.animate !== "function" ||
    !sun ||
    !cloud ||
    !name ||
    !dockHost ||
    !dock
  ) {
    hide();
    return;
  }

  const sunBox = boxOf(sun);
  // 雲と太陽の座標は SVG の単位で動かす（円の直径 286 が画面で何 px か）。山はさらに 0.91 倍の中にある。
  const unit = 286 / sunBox.w;
  const hillUnit = unit / 0.91;
  const animations: Animation[] = [];
  const run = (element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
    animations.push(element.animate(keyframes, { fill: "forwards", ...options }));
  };

  run(cloud, [{ transform: "none" }, { transform: `translate(0, ${-20 * unit}px)`, opacity: 0 }], {
    duration: ms(240),
    easing: "ease-in",
  });
  for (const hill of hills)
    run(hill, [{ transform: "none" }, { transform: `translate(0, ${80 * hillUnit}px)` }], {
      duration: ms(280),
      easing: DOWN_IN,
    });
  // 太陽はかがんで、跳ぶ。
  run(
    sun,
    [
      { transform: "none" },
      { offset: 0.45, transform: `scale(${squash(1.12)}, ${squash(0.86)})` },
      { transform: `translate(0, ${bounce(-16) * unit}px) scale(${squash(0.93)}, ${squash(1.09)})` },
    ],
    { duration: ms(220), easing: "ease-out" },
  );
  const go = ms(220);
  const morph = ms(720);
  const landAt = go + morph * 0.8;
  run(sun, [{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: go });

  // 跳んだ太陽と同じ形の墨の玉が、縦に伸びて落ち、ドックの上で横につぶれて広がる。
  // 広がりながらドックの色に変わり、ドックの形に戻ったところで本物のドックと入れ替わる。
  // 墨の色のまま本物のドックへ重ねて薄くすると、黒いドックが一瞬残って見える。
  const ink = getComputedStyle(boot).color;
  const fill = document.querySelector(".main-dock-host .cdock-fill");
  const paper = fill ? getComputedStyle(fill).fill : getComputedStyle(boot).backgroundColor;
  const blob = document.createElement("div");
  blob.setAttribute("aria-hidden", "true");
  blob.style.cssText = "position:absolute;left:0;top:0;background:currentColor;opacity:0;pointer-events:none";
  boot.appendChild(blob);
  const centerX = sunBox.x + sunBox.w / 2;
  const startW = sunBox.w * squash(0.93);
  const startH = sunBox.h * squash(1.09);
  const startY = sunBox.y + sunBox.h - startH - bounce(16);
  run(
    blob,
    [
      { ...frame(centerX - startW / 2, startY, startW, startH), opacity: 1, easing: DOWN_IN },
      {
        ...frame(centerX - sunBox.w * 0.36, sunBox.y + sunBox.h * 0.6, sunBox.w * 0.72, sunBox.h * 1.15),
        offset: 0.3,
        easing: "cubic-bezier(.4,0,.6,1)",
      },
      { ...frame(centerX - 40, dock.y - 26, 80, 70), offset: 0.6, backgroundColor: ink, easing: LAND },
      {
        ...frame(dock.x - bounce(14), dock.y + bounce(8), dock.w + bounce(28), dock.h - bounce(16)),
        offset: 0.8,
        backgroundColor: ink,
      },
      { ...frame(dock.x, dock.y, dock.w, dock.h), backgroundColor: paper, opacity: 1 },
    ],
    { duration: morph, delay: go },
  );
  const swap = go + morph;
  run(blob, [{ opacity: 1 }, { opacity: 0 }], { duration: 1, delay: swap });

  run(name, [{ opacity: 1 }, { opacity: 0, filter: "blur(4px)", transform: "translateY(6px)" }], {
    duration: ms(260),
    easing: "ease-in",
  });
  run(boot, [{ backgroundColor: getComputedStyle(boot).backgroundColor }, { backgroundColor: "transparent" }], {
    duration: ms(420),
    delay: ms(380),
    easing: "ease-out",
  });
  const page = document.querySelector(".route-background");
  if (page)
    run(
      page,
      [
        { opacity: 0, transform: "translateY(12px)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: ms(560),
        delay: ms(600),
        easing: "cubic-bezier(.22,.72,.18,1)",
        fill: "both",
      },
    );
  run(dockHost, [{ opacity: 0 }, { opacity: 1 }], { duration: 1, delay: swap, fill: "both" });
  const icons = dockHost.querySelector(".cdock-content");
  if (icons) run(icons, [{ opacity: 0 }, { opacity: 1 }], { duration: ms(160), delay: swap, fill: "both" });
  const add = document.querySelector(".mobile-add-button");
  if (add)
    run(
      add,
      [
        { opacity: 0, transform: "scale(.85)" },
        { opacity: 1, transform: "none" },
      ],
      {
        duration: ms(220),
        delay: landAt + ms(80),
        easing: UP,
        fill: "both",
      },
    );

  boot.style.pointerEvents = "none";
  void Promise.all(animations.map((animation) => animation.finished))
    .catch(() => undefined)
    .then(() => {
      hide();
      boot.style.pointerEvents = "";
      blob.remove();
      for (const animation of animations) animation.cancel();
    });
}
