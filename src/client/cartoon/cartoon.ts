// Cartoon Physics, ported line for line from the theme mock (kondo-cartoon.html)
// with the same numbers. uchiwake's cartoon-motion.ts shares the four springs
// squish / boing / split / lead; kondo adds dock / soft and its own moves:
// pop (dots appear one at a time), sink (things land, flatten, stretch back),
// tear (the ticket stub rips off) and poof (a card flattens and bursts into dots).
//
// Reduced motion (RM) behaves as in the mock: springs and keyframes resolve at
// once, Live values jump to their target and sleep() does not wait.

export type Spring = { k: number; d: number };
export const SPRINGS = {
  squish: { k: 520, d: 20 },
  boing: { k: 420, d: 14 },
  split: { k: 230, d: 21 },
  lead: { k: 700, d: 34 },
  dock: { k: 260, d: 19 },
  soft: { k: 320, d: 24 },
} as const satisfies Record<string, Spring>;
export type SpringName = keyof typeof SPRINGS;
export type SpringRef = SpringName | Spring;

export const RM = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, RM() ? 0 : ms));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sp = (n: SpringRef): Spring => (typeof n === "string" ? SPRINGS[n] : n);

/** A unit spring (0 → 1) sampled at 120 Hz until it settles (max 2 s). */
export function samples({ k, d }: Spring, v0 = 0) {
  const vals = [0];
  let x = 0,
    v = v0,
    t = 0;
  const dt = 1 / 120;
  while (t < 2) {
    const a = -k * (x - 1) - d * v;
    v += a * dt;
    x += v * dt;
    t += dt;
    vals.push(x);
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.01) break;
  }
  vals[vals.length - 1] = 1;
  return { vals, ms: Math.round(t * 1000) };
}

const ecache: Record<string, { easing: string; ms: number }> = {};
/** A spring as CSS: a `linear(...)` easing and the time it takes to settle. */
export function ease(name: SpringRef) {
  const s = sp(name),
    key = s.k + "/" + s.d;
  if (ecache[key]) return ecache[key];
  const { vals, ms } = samples(s);
  const st = Math.max(1, Math.floor(vals.length / 64));
  const pts = vals.filter((_, i) => i % st === 0 || i === vals.length - 1).map((v) => +v.toFixed(4));
  return (ecache[key] = { easing: `linear(${pts.join(",")})`, ms });
}

let linear: boolean | undefined;
/** Whether this engine can play `linear(...)` easings (else the boing curve). */
export function linearSupported() {
  if (linear === undefined) {
    try {
      linear = CSS.supports("transition-timing-function", "linear(0, 1)");
    } catch {
      linear = false;
    }
  }
  return linear;
}

/** Publishes --sp-<name> (easing) and --sp-<name>-d (duration) on :root. */
export function installSpringTokens(root = document.documentElement) {
  for (const n of Object.keys(SPRINGS) as SpringName[]) {
    const e = ease(n);
    if (linearSupported()) root.style.setProperty("--sp-" + n, e.easing);
    root.style.setProperty("--sp-" + n + "-d", e.ms + "ms");
  }
}

const BOING_FALLBACK = "cubic-bezier(.34,1.56,.64,1)";
const settle = (a: Animation | undefined) => (a ? a.finished.then(() => {}).catch(() => {}) : Promise.resolve());

/** Plays keyframes on a spring's curve and duration (WAAPI). */
export function spring(
  el: Element,
  frames: Keyframe[],
  name: SpringRef = "boing",
  extra: KeyframeAnimationOptions = {},
): Promise<void> {
  if (RM() || !el.animate) return Promise.resolve();
  const e = ease(name);
  let a: Animation;
  try {
    a = el.animate(frames, {
      duration: e.ms,
      easing: linearSupported() ? e.easing : BOING_FALLBACK,
      fill: "none",
      ...extra,
    });
  } catch {
    a = el.animate(frames, {
      duration: 500,
      easing: BOING_FALLBACK,
      ...extra,
    });
  }
  return settle(a);
}

/** Plain keyframes, skipped under reduced motion. */
export const anim = (el: Element, frames: Keyframe[], o: KeyframeAnimationOptions): Promise<void> =>
  RM() || !el.animate ? Promise.resolve() : settle(el.animate(frames, o));

/** A value driven frame by frame on a spring, retargetable mid-flight. */
export class Live {
  v: number;
  t: number;
  vel = 0;
  s: Spring;
  f = 0;
  res: (() => void)[] = [];
  constructor(
    v: number,
    public on: (v: number) => void,
    s: SpringRef = "boing",
    public eps = 0.05,
  ) {
    this.v = this.t = v;
    this.s = sp(s);
  }
  set(v: number) {
    cancelAnimationFrame(this.f);
    this.f = 0;
    this.v = this.t = v;
    this.vel = 0;
    this.on(v);
    this.res.splice(0).forEach((r) => r());
  }
  to(t: number, s?: SpringRef, vel?: number): Promise<void> {
    this.t = t;
    if (s) this.s = sp(s);
    if (vel !== undefined) this.vel = vel;
    if (RM()) {
      this.set(t);
      return Promise.resolve();
    }
    const p = new Promise<void>((r) => this.res.push(r));
    if (!this.f) {
      let last = performance.now();
      const tick = (now: number) => {
        // rAF stamps the frame start, which can precede the performance.now()
        // taken in to(); a negative step would blow the spring up.
        const dt = Math.max(0, Math.min(0.032, (now - last) / 1000));
        last = now;
        for (let i = 0; i < 4; i++) {
          const a = -this.s.k * (this.v - this.t) - this.s.d * this.vel;
          this.vel += (a * dt) / 4;
          this.v += (this.vel * dt) / 4;
        }
        if (Math.abs(this.v - this.t) < this.eps && Math.abs(this.vel) < this.eps * 10) {
          this.v = this.t;
          this.vel = 0;
          this.f = 0;
          this.on(this.v);
          this.res.splice(0).forEach((r) => r());
          return;
        }
        this.on(this.v);
        this.f = requestAnimationFrame(tick);
      };
      this.f = requestAnimationFrame(tick);
    }
    return p;
  }
  stop() {
    cancelAnimationFrame(this.f);
    this.f = 0;
    this.res.splice(0).forEach((r) => r());
  }
}

// ===== kondo's own moves =====

/** sink: falls in, flattens on landing (1.18 × 0.74), stretches back. */
export const SINK = (from = -60): Keyframe[] => [
  { transform: `translateY(${from}px) scale(.9,1.12)`, opacity: 0 },
  { transform: "translateY(0) scale(.92,1.1)", opacity: 1, offset: 0.42 },
  { transform: "translateY(0) scale(1.18,.74)", offset: 0.58 },
  { transform: "translateY(-3px) scale(.95,1.06)", offset: 0.78 },
  { transform: "none", opacity: 1 },
];
export const sink = (el: HTMLElement | SVGElement, from?: number, ms = 380) => {
  el.style.opacity = "1";
  return anim(el, SINK(from), {
    duration: ms,
    easing: "cubic-bezier(.4,0,.6,1)",
  });
};
/** pop: one dot appears on boing (stagger 55 ms per dot in the logo). */
export const pop = (el: HTMLElement | SVGElement, delay = 0) => {
  el.style.opacity = "1";
  return spring(el, [{ transform: "scale(0)" }, { transform: "scale(1)" }], "boing", {
    delay,
    fill: "backwards",
  });
};
export const fade = (el: HTMLElement, to: number, ms = 200) =>
  anim(el, [{ opacity: getComputedStyle(el).opacity }, { opacity: to }], {
    duration: ms,
    fill: "forwards",
    easing: "ease-out",
  });
/** Rises into place on boing, staggered (the mock's cascade). */
export function cascade(els: Element[], from = "translateY(46px) scale(.94)", gap = 45) {
  els.forEach((el, i) =>
    spring(
      el,
      [
        { transform: from, opacity: 0 },
        { transform: "none", opacity: 1 },
      ],
      "boing",
      {
        delay: i * gap,
        fill: "backwards",
      },
    ),
  );
}

// ===== squish: under the finger a control spreads and flattens (2-v, v) =====

const sqm = new WeakMap<HTMLElement, Live>();
/** The press spring of one element: scale (2-v, v), k600/d22. */
export function squishOf(el: HTMLElement) {
  let s = sqm.get(el);
  if (!s) {
    s = new Live(
      1,
      (v) => {
        el.style.scale = Math.abs(v - 1) < 0.0005 ? "" : `${(2 - v).toFixed(4)} ${v.toFixed(4)}`;
      },
      { k: 600, d: 22 },
      0.0005,
    );
    sqm.set(el, s);
  }
  return s;
}
export const squishDown = (el: HTMLElement, amount: number) => squishOf(el).to(amount, { k: 600, d: 22 });
export const squishUp = (el: HTMLElement) => squishOf(el).to(1, { k: 420, d: 13 });
/** A scripted tap: squish down (≤110 ms), release, wait 90 ms. */
export async function squishTap(el: HTMLElement, amt = 0.95) {
  if (RM()) return;
  await Promise.race([squishDown(el, amt), sleep(110)]);
  squishUp(el);
  await sleep(90);
}

/** What squishes and by how much; the first matching selector wins.
    Screens add their own rows with registerSquish (the mocks' SQ tables);
    press-feedback.ts plays them for pointer and keyboard presses. */
const SQ: [string, number][] = [
  [".floating-add", 0.88],
  [".cdock-group > button, .cdock-group > a, .cdock-tabs > a, .icon-button, .add-action", 0.9],
  ["[data-press-card]", 0.97],
];
export function registerSquish(selector: string, amount: number) {
  const row: [string, number] = [selector, amount];
  SQ.unshift(row);
  return () => {
    const i = SQ.indexOf(row);
    if (i >= 0) SQ.splice(i, 1);
  };
}
/** The element a press on `target` squishes, and how far. */
export function squishTarget(target: Element): [element: HTMLElement, amount: number] | null {
  for (const [sel, amt] of SQ) {
    const el = target.closest<HTMLElement>(sel);
    if (el) return [el, amt];
  }
  return null;
}

// ===== morph: a rectangle whose four edges travel on their own springs =====

export type Box = { x: number; y: number; w: number; h: number; r?: number };
export const rect = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};
type Edge = "t" | "b" | "l" | "r";
export type MorphOptions = {
  bg?: string;
  shadow?: string;
  springs?: Partial<Record<Edge, SpringRef>>;
  lag?: Partial<Record<Edge, number>>;
  zIndex?: number;
  parent?: HTMLElement;
};
/** The mock's morph(): a fixed layer whose edges spring from one box to another;
    the corner radius follows the height change from r0 to r1. */
export function morph(from: Box, to: Box, o: MorphOptions = {}) {
  const el = document.createElement("div");
  el.className = "cartoon-morph";
  el.setAttribute("aria-hidden", "true");
  if (o.bg) el.style.background = o.bg;
  if (o.shadow) el.style.boxShadow = o.shadow;
  if (o.zIndex !== undefined) el.style.zIndex = String(o.zIndex);
  (o.parent ?? document.body).appendChild(el);
  const st = { t: from.y, b: from.y + from.h, l: from.x, r: from.x + from.w };
  const R0 = from.r ?? 20,
    R1 = to.r ?? 20,
    H0 = from.h;
  const draw = () => {
    Object.assign(el.style, {
      left: st.l + "px",
      top: st.t + "px",
      width: Math.max(0, st.r - st.l) + "px",
      height: Math.max(0, st.b - st.t) + "px",
    });
    const k = Math.max(0, Math.min(1, Math.abs(st.b - st.t - H0) / Math.max(1, Math.abs(to.h - H0))));
    el.style.borderRadius = lerp(R0, R1, k) + "px";
  };
  draw();
  const sp4: Record<Edge, SpringRef> = {
    t: "lead",
    b: "split",
    l: "boing",
    r: "boing",
    ...o.springs,
  };
  const T = { t: to.y, b: to.y + to.h, l: to.x, r: to.x + to.w };
  const lag = o.lag ?? {};
  const done = Promise.all(
    (["t", "b", "l", "r"] as Edge[]).map((k) =>
      sleep(lag[k] ?? 0).then(() =>
        new Live(
          st[k],
          (v) => {
            st[k] = v;
            draw();
          },
          sp4[k],
          0.6,
        ).to(T[k]),
      ),
    ),
  ).then(() => {});
  return { el, done };
}

// ===== poof: flatten, then burst into the logo's dots =====

let fxLayer: SVGSVGElement | null = null;
function fx() {
  if (fxLayer?.isConnected) return fxLayer;
  fxLayer = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  fxLayer.setAttribute("class", "cartoon-fx");
  fxLayer.setAttribute("aria-hidden", "true");
  document.body.appendChild(fxLayer);
  return fxLayer;
}
/** Dots fly out from (cx, cy) in viewport px and shrink away (520 ms). */
export function burst(cx: number, cy: number, n = 10, spread = 70, color = "var(--p-ink)") {
  if (RM()) return;
  const layer = fx();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.5,
      d = spread * (0.6 + Math.random() * 0.6),
      r = 4 + Math.random() * 4;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(cx));
    c.setAttribute("cy", String(cy));
    c.setAttribute("r", String(r));
    c.setAttribute("fill", color);
    c.style.transformBox = "fill-box";
    c.style.transformOrigin = "center";
    layer.appendChild(c);
    void anim(
      c,
      [
        { transform: "translate(0,0) scale(.4)" },
        {
          transform: `translate(${Math.cos(a) * d * 0.7}px,${Math.sin(a) * d * 0.7}px) scale(1.2)`,
          offset: 0.45,
        },
        {
          transform: `translate(${Math.cos(a) * d}px,${Math.sin(a) * d + 18}px) scale(0)`,
        },
      ],
      { duration: 520, easing: "cubic-bezier(.2,.7,.3,1)" },
    ).then(() => c.remove());
  }
}
/** poof: the card squashes flat (240 ms) and bursts into 12 dots. The card is
    left hidden (opacity 0); collapse its row with collapse() if it leaves. */
export async function poof(card: HTMLElement, dots = 12, spread = 90) {
  card.style.transformOrigin = "50% 50%";
  await anim(
    card,
    [{ transform: "none" }, { transform: "scale(.94,1.08)", offset: 0.3 }, { transform: "scale(1.2,.08)", opacity: 1 }],
    { duration: 240, easing: "cubic-bezier(.5,0,.8,.4)", fill: "forwards" },
  );
  const r = card.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2, dots, spread);
  card.style.opacity = "0";
  card.getAnimations?.().forEach((a) => a.cancel());
}
/** The emptied row closes on the lead spring (360 ms in the mock). */
export const collapse = (row: HTMLElement, pad = "7px") =>
  anim(
    row,
    [
      { height: row.offsetHeight + "px", paddingTop: pad, paddingBottom: pad },
      { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
    ],
    {
      duration: 360,
      easing: linearSupported() ? ease("lead").easing : "ease-out",
    },
  );
/** Undo: the row reopens (260 ms) and the card drops back in with sink. */
export async function unpoof(row: HTMLElement, card: HTMLElement, pad = "7px") {
  const h = row.offsetHeight;
  card.style.opacity = "0";
  await anim(
    row,
    [
      { height: "0px", paddingTop: "0px", paddingBottom: "0px" },
      { height: h + "px", paddingTop: pad, paddingBottom: pad },
    ],
    { duration: 260, easing: "cubic-bezier(.2,.8,.3,1)" },
  );
  await sink(card, -80, 420);
}

// ===== tear: the ticket stub rips along its perforation and falls =====

/** Perforation dots swell and vanish (200 ms, 18 ms apart), then the stub
    twists and falls (720 ms). Call restoreStub() once the screen has changed. */
export async function tearStub(stub: HTMLElement, perfDots: Element[] = []) {
  perfDots.forEach((p, i) =>
    anim(p, [{ transform: "scale(1)" }, { transform: "scale(2.2)", offset: 0.4 }, { transform: "scale(0)" }], {
      duration: 200,
      delay: i * 18,
      fill: "forwards",
    }),
  );
  await sleep(150);
  await anim(
    stub,
    [
      { transform: "none" },
      { transform: "translate(6px,-4px) rotate(7deg)", offset: 0.22 },
      { transform: "translate(14px,4px) rotate(14deg)", offset: 0.4 },
      { transform: "translate(70px,900px) rotate(64deg)" },
    ],
    { duration: 720, easing: "cubic-bezier(.5,0,.85,.55)", fill: "forwards" },
  );
}
export function restoreStub(stub: HTMLElement, perfDots: Element[] = []) {
  stub.getAnimations?.().forEach((a) => a.cancel());
  perfDots.forEach((p) => p.getAnimations?.().forEach((a) => a.cancel()));
}
