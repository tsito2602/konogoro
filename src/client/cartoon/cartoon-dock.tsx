import { Component, createRef, type ReactNode } from "react";
import { anim, Live, RM, samples, sleep, spring } from "./cartoon";
import { dockContour, morphDock, MORPH_MS, prepareDockMorph, type DockIsland, type DockMorphPlan } from "./dock-morph";

// The cartoon dock from kondo-cartoon.html (section 9) and kondo-itinerary.html,
// with the original fluid dock's morph (dock-morph.ts): the solid islands are
// one SVG contour, and every change of layout (tabs to a detail, a sheet's
// back circle, the undo toast, settings) morphs that contour in one eased
// move. Islands part and join through a neck rather than one pill sliding
// over another, and an island that is no longer needed melts into its
// neighbour instead of shrinking into a separate blob. The cartoon touches
// stay: the launch logo inflates the dock,
// and pressing anywhere on an island squishes the whole island (2-v, v).
//
// What sits on the islands is plain markup in groups ([data-slot]): l (back),
// tabs, m (a separate function beside the context actions, such as しおりで見る
// or 詳細を開く: its own island), r (context actions) and toast. The islands
// follow the groups' boxes.

export type DockSlot = "l" | "tabs" | "k" | "m" | "r" | "toast";

/** One group of dock controls; its CSS box decides where its island goes. */
export function DockGroup({
  slot,
  tone,
  mixed,
  wide,
  stretch,
  className,
  children,
}: {
  slot: DockSlot;
  /** "ink": the island under this group turns ink (a lone save button);
      "ink-dim": that ink at the mocks' disabled .4 (読み取る before a file). */
  tone?: "ink" | "ink-dim";
  /** Several actions with a primary one: the primary is an ink pill. */
  mixed?: boolean;
  /** Spans the room left between the islands beside it (保存). */
  stretch?: boolean;
  /** Spread over the tab row's span (context tools such as a note's). */
  wide?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`cdock-group${className ? ` ${className}` : ""}`}
      data-slot={slot}
      data-tone={tone}
      data-mixed={mixed || undefined}
      data-stretch={stretch || undefined}
      data-wide={wide || undefined}
    >
      {children}
    </div>
  );
}

/** The mocks' back chevron (stroke 2.4). */
export function DockBackIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

type Span = [number, number];
type Groups = { key: string; el: HTMLElement }[];
type Shape = { islands: DockIsland[]; tension: number };

/** Island height (56, uchiwake's) and where its centre sits in the 120 px islands box. */
const RADIUS = 28;
const CENTER = 120 - 30 - RADIUS;
const tones = new Set(["ink", "ink-dim"]);

/** The fluid dock's path on a near-critically damped spring: the islands
    glide into their new shape and stop without a wobble (Tsubasa
    2026-10-06: the overshoot was 「強すぎる」, then no プルン after a morph). */
const JELLY = samples({ k: 300, d: 34 });
const MORPH = Math.max(MORPH_MS, JELLY.ms);
const jelly = (t: number) => {
  const at = t * (JELLY.vals.length - 1),
    i = Math.floor(at);
  if (i >= JELLY.vals.length - 1) return 1;
  return JELLY.vals[i] + (JELLY.vals[i + 1] - JELLY.vals[i]) * (at - i);
};

/** Hides and shows groups as the mock's show(): fade out .12s; fade in .14s
    after .08s while each control pops from 0.4 (k380 d13, 110 ms + 45 ms each). */
function popIn(group: HTMLElement) {
  if (RM()) return;
  void anim(group, [{ opacity: 0 }, { opacity: 1 }], {
    duration: 140,
    delay: 80,
    easing: "ease",
    fill: "backwards",
  });
  const parts = [...group.children].filter((child) => !child.matches(".cdock-ind, .haptic-touch"));
  const frames = [
    { transform: "scale(.4)", opacity: 0 },
    { transform: "none", opacity: 1 },
  ];
  parts.forEach((b, i) => spring(b, frames, { k: 380, d: 13 }, { delay: 110 + i * 45, fill: "backwards" }));
  // The selection pill pops with its own tab, so it never shows empty while
  // a tab further along is still on its way in.
  const on = parts.findIndex((b) => b.matches('[data-on="true"]'));
  const pill = group.querySelector<HTMLElement>(":scope > .cdock-ind");
  if (pill && on >= 0) spring(pill, frames, { k: 380, d: 13 }, { delay: 110 + on * 45, fill: "backwards" });
}

const keyOf = (el: HTMLElement, identity: string) => {
  const slot = el.dataset.slot ?? "";
  // The back circle and the tab row stay put across modes; context actions
  // and toasts belong to the screen that put them there.
  return slot === "l" || slot === "tabs" ? slot : `${slot}:${identity}`;
};

type Props = { identity: string; children: ReactNode };

/** What a dock looked like as it left the screen. A dock that mounts in the
    same place right after (the post page's own dock, which has to live inside
    its modal dialog, and the page's dock again when the post closes) starts
    from this shape and morphs on, so the islands never vanish and reappear
    (Tsubasa 2026-11-03「ボトムナビは一旦隠れて再登場せず、変形させるだけ」). */
type Carry = { shape: Shape; width: number; copies: HTMLElement[]; at: number; identity: string; moving: boolean };
let carried: Carry | null = null;
const CARRY_MS = 600;

/** Dispatched on window when the dock moves into another dialog or the page. */
export const DOCK_MOVED = "kondo:dock-moved";

/** Dispatched on window when the launch logo lands in the dock (boot.ts). */
export const DOCK_INFLATE = "kondo:dock-inflate";

export class CartoonDock extends Component<Props> {
  root = createRef<HTMLDivElement>();
  goo = createRef<HTMLDivElement>();
  fill = createRef<SVGPathElement>();
  ink = createRef<SVGPathElement>();
  ui = createRef<HTMLDivElement>();
  /** What is drawn now, and the layout it is heading for. */
  shape: Shape | null = null;
  geo = "";
  tone = "";
  merged = false;
  width = 0;
  retry = 0;
  tries = 0;
  frame = 0;
  morph: {
    from: DockIsland[];
    to: DockIsland[];
    tension: number;
    start: number;
    plan: DockMorphPlan;
    done: () => void;
  } | null = null;
  /** The pressed island (its index in the drawn shape) and its squish. */
  pressed = -1;
  Q = new Live(1, () => this.paint(), { k: 600, d: 18 }, 0.0005);
  /** The whole dock's crouch, stretch and landing squish around a morph. */
  J = new Live(1, () => this.paint(), { k: 600, d: 18 }, 0.0005);
  last = "";
  observer?: ResizeObserver;

  groups(): Groups {
    const ui = this.ui.current;
    if (!ui) return [];
    return [...ui.querySelectorAll<HTMLElement>(":scope > .cdock-content > [data-slot]")].map((el) => ({
      key: keyOf(el, this.props.identity),
      el,
    }));
  }

  getSnapshotBeforeUpdate(previous: Props) {
    const ui = this.ui.current;
    if (!ui) return null;
    // React may reuse a group's node for the next screen's controls, so keep a
    // copy of what is showing now to fade it out in place.
    return [...ui.querySelectorAll<HTMLElement>(":scope > .cdock-content > [data-slot]")].map((el) => ({
      key: keyOf(el, previous.identity),
      el,
      copy: RM() ? null : (el.cloneNode(true) as HTMLElement),
    }));
  }

  componentDidMount() {
    const root = this.root.current!;
    const carry = carried;
    carried = null;
    if (carry && !RM() && performance.now() - carry.at < CARRY_MS && carry.shape.islands.length) {
      // Pick up where the leaving dock was, fade out its controls, and morph on.
      this.shape = carry.shape;
      this.width = carry.width;
      if (carry.identity === this.props.identity) {
        // The leaving dock already took this form (a post page's dock that turned back into
        // the tabs before closing): take it over as it is, without fading the controls
        // out and in again or crouching a second time (Tsubasa 2026-11-03: 「戻った後に
        // もう一度変形アニメーションが入っている」). Only an unfinished morph carries on.
        this.paint();
        this.layout(!carry.moving, true);
      } else {
        for (const copy of carry.copies) {
          this.ui.current!.appendChild(copy);
          void anim(copy, [{ opacity: 1 }, { opacity: 0 }], { duration: 120, easing: "ease", fill: "forwards" }).then(
            () => copy.remove(),
          );
        }
        for (const { el } of this.groups()) popIn(el);
        this.paint();
        this.layout(false);
      }
    } else this.layout(true);
    this.observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : // Only a change between two real widths (a rotation) jumps; coming
          // back from hidden (0) animates from where the islands were.
          new ResizeObserver(() =>
            this.layout(Boolean(this.width && root.clientWidth) && this.width !== root.clientWidth),
          );
    this.observer?.observe(root);
    root.addEventListener("pointerdown", this.down, true);
    window.addEventListener(DOCK_INFLATE, this.onInflate);
    window.addEventListener(DOCK_MOVED, this.onMoved);
    window.addEventListener("pointerup", this.up, true);
    window.addEventListener("pointercancel", this.up, true);
  }

  componentDidUpdate(
    _previous: Props,
    _state: unknown,
    before: { key: string; el: HTMLElement; copy: HTMLElement | null }[] | null,
  ) {
    const now = this.groups();
    if (before) {
      const keys = new Set(now.map((g) => g.key));
      const old = new Set(before.map((g) => g.key));
      for (const { key, copy } of before) {
        if (keys.has(key) || !copy) continue;
        copy.inert = true;
        copy.dataset.outgoing = "true";
        copy.setAttribute("aria-hidden", "true");
        for (const node of [copy, ...copy.querySelectorAll("*")])
          for (const attribute of ["id", "name", "form", "href", "autofocus"]) node.removeAttribute(attribute);
        this.ui.current!.appendChild(copy);
        void anim(copy, [{ opacity: 1 }, { opacity: 0 }], {
          duration: 120,
          easing: "ease",
          fill: "forwards",
        }).then(() => copy.remove());
      }
      for (const { key, el } of now) if (!old.has(key)) popIn(el);
    }
    this.layout(false);
  }

  componentWillUnmount() {
    if (this.shape && this.width)
      carried = {
        shape: this.shape,
        width: this.width,
        identity: this.props.identity,
        moving: Boolean(this.morph),
        at: performance.now(),
        copies: this.groups().map(({ el }) => {
          const copy = el.cloneNode(true) as HTMLElement;
          copy.inert = true;
          copy.dataset.outgoing = "true";
          copy.setAttribute("aria-hidden", "true");
          for (const node of [copy, ...copy.querySelectorAll("*")])
            for (const attribute of ["id", "name", "form", "href", "autofocus"]) node.removeAttribute(attribute);
          return copy;
        }),
      };
    this.observer?.disconnect();
    cancelAnimationFrame(this.retry);
    cancelAnimationFrame(this.frame);
    this.morph?.done();
    this.morph = null;
    const root = this.root.current;
    root?.removeEventListener("pointerdown", this.down, true);
    window.removeEventListener(DOCK_INFLATE, this.onInflate);
    window.removeEventListener(DOCK_MOVED, this.onMoved);
    cancelAnimationFrame(this.moved);
    window.removeEventListener("pointerup", this.up, true);
    window.removeEventListener("pointercancel", this.up, true);
    this.Q.stop();
    this.J.stop();
  }

  /** Where the islands should be, from the visible groups' boxes. */
  targets(): {
    islands: Span[];
    merged: boolean;
    tone: string;
    inkAt: number;
  } | null {
    const box = (el?: HTMLElement): Span | null => (el ? [el.offsetLeft, el.offsetLeft + el.offsetWidth] : null);
    const find = (...slots: DockSlot[]) =>
      this.groups().find(({ el }) => slots.includes(el.dataset.slot as DockSlot))?.el;
    const toast = find("toast"),
      left = find("l"),
      keep = find("k"),
      middle = find("m"),
      right = find("tabs", "r");
    // Controls that carry their own pills (a plan's 削除 and 編集 circles)
    // need no island under them.
    const a = left?.querySelector(":scope > .ps-dock-circle") ? null : box(left);
    if (toast) {
      const t = box(toast)!;
      return { islands: a ? [a, t] : [t], merged: !a, tone: "", inkAt: -1 };
    }
    const b = box(right);
    const m = right ? box(middle) : null;
    const k = right ? box(keep) : null;
    // The ink island: the right one, or a stretched 保存 in the middle.
    const inked = [right, middle].find((el) => tones.has(el?.dataset.tone ?? ""));
    const spans = [a, k, m, b];
    const groups = [left, keep, middle, right];
    const islands = spans.filter((span): span is Span => Boolean(span));
    return {
      islands,
      merged: false,
      tone: inked?.dataset.tone ?? "",
      inkAt: inked ? islands.indexOf(spans[groups.indexOf(inked)]!) : -1,
    };
  }

  /** quiet: a morph carried over from another dock goes on without crouching again. */
  layout(instant: boolean, quiet = false) {
    const root = this.root.current;
    if (!root) return;
    cancelAnimationFrame(this.retry);
    if (!root.clientWidth) {
      // Hidden for a moment: a closing dialog that still holds the dock is
      // display:none until the provider moves the dock back to the page.
      // Try again on the next frames rather than leave the islands stale.
      if (this.tries++ < 30) this.retry = requestAnimationFrame(() => this.layout(instant));
      return;
    }
    this.tries = 0;
    this.width = root.clientWidth;
    // The middle island sits 12 px left of the right one, whatever its width.
    const right = this.groups().find(({ el }) => el.dataset.slot === "r")?.el;
    this.ui.current?.style.setProperty("--cdock-r-w", `${right?.offsetWidth ?? 0}px`);
    // A stretched middle starts after the 持たない-style island, if any.
    const keep = this.groups().find(({ el }) => el.dataset.slot === "k")?.el;
    this.ui.current?.style.setProperty("--cdock-k-w", keep ? `${keep.offsetWidth + 10}px` : "0px");
    const t = this.targets();
    if (!t) return;
    const key = JSON.stringify([this.width, t.islands, t.tone]);
    if (key === this.geo && !instant) return;
    this.geo = key;
    this.merged = t.merged;
    if (t.tone) this.tone = t.tone;
    // The right-hand island carries the tone (a lone save turns it ink); the
    // ink fades in only once the morph is well on its way, as in the fluid dock.
    const to = t.islands.map(([l, r], i): DockIsland => ({
      left: l,
      width: r - l,
      radius: RADIUS,
      slot: i,
      tint: t.tone && i === t.inkAt ? 1 : 0,
    }));
    const from = this.shape;
    if (instant || !from || !from.islands.length || RM()) {
      this.stopMorph();
      this.shape = { islands: to, tension: 0 };
      this.paint();
      return;
    }
    // The dock crouches as the material starts to move and rises with it,
    // then simply stops: nothing wobbles once the morph has landed
    // (Tsubasa 2026-10-06: 「ドックが変形したあとの勝手にプルンとする動きいらない」).
    if (quiet) {
      void this.morphTo(to);
      return;
    }
    void this.J.to(0.92, { k: 700, d: 26 });
    const up = setTimeout(() => void this.J.to(1, { k: 420, d: 41 }), 70);
    void this.morphTo(to).then((landed) => {
      clearTimeout(up);
      if (!landed) return;
      void this.J.to(1, { k: 420, d: 41 });
    });
  }

  stopMorph() {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.morph?.done();
    this.morph = null;
  }

  /** Morph from exactly what is drawn now (also mid-morph) to `to`. Resolves
      true once it lands, false when another layout takes over. */
  morphTo(to: DockIsland[]): Promise<boolean> {
    const from = this.shape!;
    const previous = this.morph;
    this.morph = null;
    previous?.done();
    let landed = false;
    return new Promise<boolean>((resolve) => {
      this.morph = {
        from: from.islands,
        to,
        tension: from.tension,
        start: performance.now(),
        plan: prepareDockMorph(from.islands, to),
        done: () => resolve(landed),
      };
      const tick = (now: number) => {
        this.frame = 0;
        const m = this.morph;
        if (!m) return;
        const p = Math.min(1, Math.max(0, (now - m.start) / MORPH));
        this.shape = morphDock(m.from, m.to, m.tension, p, m.plan, jelly);
        this.paint();
        if (p < 1) {
          this.frame = requestAnimationFrame(tick);
          return;
        }
        landed = true;
        this.morph = null;
        m.done();
      };
      if (!this.frame) this.frame = requestAnimationFrame(tick);
    });
  }

  moved = 0;
  /** After a move between dialogs, repaint the islands from scratch at once
      (the move happens before the dialog's first paint; waiting for a frame
      left WebKit showing no dock, then a jump, Tsubasa 2026-10-07
      「予約開いたらドックがチラつく」) and again on the next two frames. */
  onMoved = () => {
    cancelAnimationFrame(this.moved);
    const redraw = () => {
      const goo = this.goo.current;
      if (!goo) return;
      this.last = "";
      goo.style.display = "none";
      void goo.offsetWidth;
      goo.style.display = "";
      this.layout(false);
      this.paint();
    };
    redraw();
    this.moved = requestAnimationFrame(() => {
      redraw();
      this.moved = requestAnimationFrame(redraw);
    });
  };

  /** Draw the current shape (and the pressed island's squish). */
  paint() {
    const shape = this.shape,
      fill = this.fill.current,
      ink = this.ink.current,
      goo = this.goo.current;
    if (!shape || !fill || !ink || !goo) return;
    const w = this.width || this.root.current?.clientWidth || 0;
    const scales = shape.islands.map((island, i) => {
      const v = this.J.v * (i === this.pressed ? this.Q.v : 1);
      if (Math.abs(v - 1) <= 0.0005) return { x: 1, y: 1 };
      // A squish widens an island, but never into a separate neighbour: with
      // three islands 12 px apart the landing would otherwise join them.
      const gap = Math.min(
        ...shape.islands.map((other) =>
          other === island
            ? Infinity
            : Math.max(other.left - island.left - island.width, island.left - other.left - other.width),
        ),
      );
      const room = gap > 0 && island.width > 0 ? 1 + (gap - 6) / island.width : Infinity;
      return { x: Math.min(2 - v, Math.max(1, room)), y: v };
    });
    const d = dockContour(w, shape.islands, shape.tension, scales, CENTER);
    const tinted = shape.islands
      .map((island, i) => ({ island, scale: scales[i] }))
      .filter(({ island }) => (island.tint ?? 0) > 0.001);
    const a = dockContour(
      w,
      tinted.map(({ island }) => island),
      shape.tension,
      tinted.map(({ scale }) => scale),
      CENTER,
    );
    const opacity = Math.max(0, ...tinted.map(({ island }) => island.tint!));
    const key = d + "|" + a + "|" + opacity.toFixed(3) + this.tone;
    if (key === this.last) return;
    this.last = key;
    fill.setAttribute("d", d);
    ink.setAttribute("d", a);
    ink.style.opacity = opacity.toFixed(3);
    goo.dataset.tone = this.tone;
    // The visible islands' spans: what the dock looks like, for its tests.
    goo.dataset.shape = JSON.stringify(
      shape.islands
        .filter((island) => island.width > 0.5 && island.radius > 0)
        .sort((x, y) => x.left - y.left)
        .map((island) => [Math.round(island.left * 10) / 10, Math.round((island.left + island.width) * 10) / 10]),
    );
  }

  /** Launch: the dock inflates out of the logo's impact (kondo-cartoon §1). */
  inflate(from?: Span) {
    const mid = (this.root.current?.clientWidth ?? 390) / 2;
    from ??= [mid - RADIUS, mid + RADIUS];
    if (RM() || !this.root.current?.clientWidth) return;
    this.stopMorph();
    this.shape = {
      islands: [{ left: from[0], width: from[1] - from[0], radius: RADIUS, slot: 0 }],
      tension: 0,
    };
    this.paint();
    void spring(this.goo.current!, [{ transform: "scale(1.3,.62)" }, { transform: "none" }], "boing");
    void sleep(140).then(() => {
      this.geo = "";
      this.layout(false);
    });
  }

  onInflate = () => this.inflate();

  // pressing anywhere on an island squishes the whole island too
  down = (e: PointerEvent) => {
    if (RM() || e.button !== 0 || !this.shape) return;
    const root = this.root.current;
    if (!root || !(e.target as Element).closest?.(".cdock-content")) return;
    const r = root.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * root.clientWidth;
    this.pressed = this.shape.islands.findIndex((I) => I.width > 0 && x >= I.left && x <= I.left + I.width);
    if (this.pressed >= 0) void this.Q.to(0.95, { k: 600, d: 22 });
  };
  up = () => {
    if (this.pressed >= 0) void this.Q.to(1, { k: 420, d: 12 });
  };

  render() {
    return (
      <div ref={this.root} className="cdock">
        <div ref={this.goo} className="cdock-islands" aria-hidden="true">
          <svg className="cdock-shape" width="100%" height="120">
            <path ref={this.fill} className="cdock-fill" />
            <path ref={this.ink} className="cdock-ink" style={{ opacity: 0 }} />
          </svg>
        </div>
        <div ref={this.ui} className="cdock-ui">
          <div className="cdock-content">{this.props.children}</div>
        </div>
      </div>
    );
  }
}
