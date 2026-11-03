import { Live, RM, anim, sleep } from "./cartoon/cartoon";

// 投稿ページの動き（案C、Tsubasa 2026-11-03）。
// タイムラインのカードの四辺がそれぞれのばねで広がって投稿ページになり（上 lead、下 split、左右 boing）、
// 中身はカードと同じ位置から動き出す。コメントを書くときは、ページが画面を覆いきった瞬間から止まらずに
// dock のばねで持ち上がり、ページの外（下の面）にある書き込み欄が見える。戻るときはページがカードへ縮んで戻る。

type Edges = { t: number; b: number; l: number; r: number };
const EDGES = ["t", "b", "l", "r"] as const;

export class PostMotion {
  /** ページの四辺（画面の座標）、持ち上げ量（負で上）、中身のずれ。 */
  s = { t: 0, b: 0, l: 0, r: 0, y: 0, off: 0 };
  clip = false;
  frame = 0;
  /** reset 後は何も描かない（遅れて来るタイマーが、次のページの動きを上書きしないように）。 */
  dead = false;
  /** カードから広がるページが画面（パネルの枠）を覆いきったら呼ぶ。 */
  private covered: (() => void) | null = null;
  live: Record<(typeof EDGES)[number] | "y" | "off", Live>;

  constructor(
    private panel: HTMLElement,
    private content: () => HTMLElement | null,
    private sheet: () => HTMLElement | null,
    private onLift: (progress: number) => void = () => {},
  ) {
    const set = (key: keyof PostMotion["s"]) => (value: number) => {
      this.s[key] = value;
      this.draw();
    };
    this.live = {
      t: new Live(0, set("t"), "lead", 0.5),
      b: new Live(0, set("b"), "split", 0.5),
      l: new Live(0, set("l"), "boing", 0.5),
      r: new Live(0, set("r"), "boing", 0.5),
      y: new Live(0, set("y"), "dock", 0.3),
      off: new Live(0, set("off"), "split", 0.3),
    };
  }

  /** 書き込み欄の高さ（とキーボードの分）だけ持ち上げる量。 */
  liftHeight(keyboard = 0) {
    return (this.sheet()?.offsetHeight ?? 0) + keyboard;
  }

  draw() {
    if (!this.dead && !this.frame) this.frame = requestAnimationFrame(() => this.paint());
  }

  paint() {
    this.frame = 0;
    if (this.dead) return;
    const { panel } = this;
    const y = Math.min(0, this.s.y);
    const height = this.sheet()?.offsetHeight || 1;
    const progress = Math.max(0, Math.min(1, -y / height));
    panel.style.translate = y ? `0 ${y.toFixed(2)}px` : "";
    const content = this.content();
    if (content) content.style.translate = Math.abs(this.s.off) > 0.3 ? `0 ${this.s.off.toFixed(2)}px` : "";
    const bottom = 30 * progress;
    panel.style.setProperty("--lift", progress.toFixed(3));
    if (this.clip) {
      const box = panel.getBoundingClientRect();
      // 四辺は持ち上げる前のページの座標で動かし、持ち上げ（y）はページごと動かす。
      // getBoundingClientRect は translate を含むので、持ち上げ前の位置に戻して比べる。
      const top = box.top - y;
      const inset = {
        t: Math.max(0, this.s.t - top),
        b: Math.max(0, top + box.height - this.s.b),
        l: Math.max(0, this.s.l - box.left),
        r: Math.max(0, box.right - this.s.r),
      };
      const round = Math.min(20, Math.max(inset.t, inset.b, inset.l, inset.r) * 0.4);
      panel.style.clipPath = `inset(${inset.t.toFixed(1)}px ${inset.r.toFixed(1)}px ${inset.b.toFixed(1)}px ${inset.l.toFixed(1)}px round ${round.toFixed(1)}px)`;
      panel.style.borderRadius = "";
      // 四辺が一度ずつ枠に届いたら覆いきった。あとの小さな揺れは捨てて、枠いっぱいのページにする。
      if (this.covered && Math.max(inset.t, inset.b, inset.l, inset.r) < 0.5) {
        this.clip = false;
        panel.style.clipPath = "";
        const done = this.covered;
        this.covered = null;
        done();
      }
    } else {
      // 持ち上がったページは角を丸め、下の面へ影を落とす（clip-path だと影が切れるので border-radius）。
      panel.style.clipPath = "";
      panel.style.borderRadius = progress > 0.001 ? `0 0 ${bottom.toFixed(1)}px ${bottom.toFixed(1)}px` : "";
    }
    // 書き込み欄はページの外（下の面）にずっとあるもの。ページが覆っている間だけ隠し、
    // 持ち上がり始めたら不透明のまま見せて、中身だけ少し遅れて上がる。
    const sheet = this.sheet();
    if (sheet) {
      sheet.style.opacity = y < -0.5 ? "1" : "0";
      sheet.style.setProperty("--sheet-shift", `${((1 - progress) * 18).toFixed(1)}px`);
    }
    this.onLift(progress);
  }

  private async later(ms: number, run: () => Promise<void>) {
    await sleep(ms);
    if (!this.dead) await run();
  }

  private setEdges(edges: Edges) {
    for (const key of EDGES) this.live[key].set(edges[key]);
  }

  private panelEdges(): Edges {
    const box = this.panel.getBoundingClientRect();
    const top = box.top - Math.min(0, this.s.y);
    return { t: top, b: top + box.height, l: box.left, r: box.right };
  }

  /** カード → 投稿ページ。lift なら覆いきったところから、止まらずに持ち上げまでつなぐ。 */
  async enter(card: DOMRect, height: number | null, onLift: () => void) {
    if (RM()) {
      if (height) {
        onLift();
        this.live.y.set(-height);
      }
      return;
    }
    const content = this.content();
    const contentTop = content ? content.getBoundingClientRect().top : card.top;
    this.live.off.set(card.top - contentTop);
    this.setEdges({ t: card.top, b: card.bottom, l: card.left, r: card.right });
    this.live.y.set(0);
    this.clip = true;
    this.paint();
    const target = this.panelEdges();
    const covered = new Promise<void>((resolve) => (this.covered = resolve));
    const edges = Promise.all([
      this.live.t.to(target.t, "lead"),
      this.live.l.to(target.l, "boing"),
      this.live.r.to(target.r, "boing"),
      this.later(35, () => this.live.b.to(target.b, "split")),
    ]).then(() => this.covered?.());
    await Promise.all([
      edges,
      this.live.off.to(0, "split"),
      // 持ち上げは、ページが画面を覆いきった瞬間に止まらずに続ける（下にタイムラインを見せない）。
      height
        ? covered.then(() => {
            if (this.dead) return;
            onLift();
            return this.live.y.to(-height, "dock");
          })
        : Promise.resolve(),
    ]);
    if (this.dead) return;
    this.covered = null;
    this.clip = false;
    this.paint();
  }

  /** 投稿ページ → カードへ縮んで戻る。 */
  async exit(card: DOMRect) {
    if (RM()) return;
    const content = this.content();
    const contentTop = content ? content.getBoundingClientRect().top - this.s.off : 0;
    this.setEdges(this.panelEdges());
    this.clip = true;
    this.paint();
    await Promise.all([
      this.live.b.to(card.bottom, "lead"),
      this.live.l.to(card.left, "boing"),
      this.live.r.to(card.right, "boing"),
      this.later(35, () => this.live.t.to(card.top, "split")),
      content ? this.live.off.to(card.top - contentTop, "split") : Promise.resolve(),
      // 縮みきる直前に薄くして、下にある本物のカードへ渡す。
      this.later(170, () =>
        anim(this.panel, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: "ease-in", fill: "forwards" }),
      ),
    ]);
  }

  lift(height: number) {
    return this.live.y.to(-height, "dock");
  }

  drop() {
    return this.live.y.to(0, "dock");
  }

  /** 指で引いている間は、持ち上げ量を指に合わせる。 */
  follow(y: number) {
    this.live.y.set(y);
  }

  /** カードから広がっている途中（持ち上げは覆いきってから enter が始める）。 */
  get entering() {
    return this.covered !== null;
  }

  get lifted() {
    return this.s.y < -1;
  }

  reset() {
    this.dead = true;
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    for (const live of Object.values(this.live)) live.stop();
    this.panel.style.translate = "";
    this.panel.style.clipPath = "";
    this.panel.style.borderRadius = "";
    this.panel.style.removeProperty("--lift");
    this.covered = null;
    const content = this.content();
    if (content) content.style.translate = "";
  }
}
