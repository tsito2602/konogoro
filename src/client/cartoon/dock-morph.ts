// The dock's material, ported from the fluid dock (fluid-dock.tsx on main,
// itself uchino's floating nav): the islands are capsules drawn as one SVG
// contour, and a change of layout morphs that contour over 600 ms with an
// ease-out curve. Material is never created out of nothing: when the number
// of islands changes, the fewer ones are split along their straight spine so
// every piece has a partner, and while they part or join a smooth union draws
// a neck between them instead of two pills sliding over each other.

export const MORPH_MS = 600;
const samples = 320;
export const morphEase = (t: number) => 1 - (1 - t) ** 3;
const ease = morphEase;

export type DockIsland = {
  left: number;
  width: number;
  radius: number;
  slot?: number;
  tint?: number;
  blend?: boolean;
};

/** Reduce representation-only lobes to the actual visible capsule. */
function visibleDock(islands: DockIsland[]) {
  const result: DockIsland[] = [];
  for (const island of islands.filter((item) => item.width > 0 && item.radius > 0).sort((a, b) => a.left - b.left)) {
    const previous = result.at(-1);
    if (
      previous &&
      previous.blend === undefined &&
      island.blend === undefined &&
      previous.radius === island.radius &&
      (previous.tint ?? 0) === (island.tint ?? 0) &&
      previous.slot === island.slot &&
      island.left + island.radius <= previous.left + previous.width - previous.radius + 0.001
    ) {
      previous.width = Math.max(previous.left + previous.width, island.left + island.width) - previous.left;
    } else result.push({ ...island });
  }
  return result;
}

export type DockMorphPlan = {
  from: DockIsland[];
  to: DockIsland[];
  simple: boolean;
};

/** Split along a capsule's straight spine; the pieces still draw the exact same surface. */
function splitDock(donors: DockIsland[], references: DockIsland[]) {
  let best: DockIsland[] = [],
    bestCost = Infinity;
  const allocate = (counts: number[], remaining: number) => {
    if (counts.length < donors.length - 1) {
      for (let count = 1; count <= remaining - (donors.length - counts.length - 1); count++)
        allocate([...counts, count], remaining - count);
      return;
    }
    const allocation = [...counts, remaining];
    const parts: DockIsland[] = [];
    let offset = 0,
      cost = 0;
    donors.forEach((donor, i) => {
      const group = references.slice(offset, offset + allocation[i]);
      const first = group[0],
        last = group.at(-1)!;
      cost += Math.abs(donor.left - first.left) + Math.abs(donor.left + donor.width - last.left - last.width);
      const radius = Math.min(donor.radius, donor.width / 2);
      const start = donor.left + radius,
        end = donor.left + donor.width - radius;
      const cuts = [start];
      for (let j = 1; j < group.length; j++) {
        const left = group[j - 1],
          right = group[j];
        const seam = (left.left + left.width - left.radius + right.left + right.radius) / 2;
        cuts.push(Math.max(cuts.at(-1)!, Math.min(end, seam)));
      }
      cuts.push(end);
      for (let j = 0; j < group.length; j++)
        parts.push({
          ...donor,
          left: cuts[j] - radius,
          width: cuts[j + 1] - cuts[j] + radius * 2,
          radius,
        });
      offset += group.length;
    });
    if (cost < bestCost) {
      best = parts;
      bestCost = cost;
    }
  };
  allocate([], references.length);
  return best;
}

/** Correspond by visible position, expanding/splitting existing material, never a zero-sized slot. */
export function prepareDockMorph(from: DockIsland[], to: DockIsland[]): DockMorphPlan {
  let a = visibleDock(from),
    b = visibleDock(to);
  // The same number of islands only move and resize: they keep their order
  // and their gaps, so no neck is needed (three islands: ‹, しおり, 編集 削除).
  const simple = a.length === b.length;
  if (!a.length || !b.length) return { from, to, simple };
  if (a.length < b.length) a = splitDock(a, b);
  else if (b.length < a.length) b = splitDock(b, a);
  return { from: a, to: b, simple };
}

export function morphDock(
  from: DockIsland[],
  to: DockIsland[],
  tension: number,
  t: number,
  plan = prepareDockMorph(from, to),
  /** Progress along the move; may overshoot 1 for a jelly landing. */
  curve: (t: number) => number = ease,
) {
  if (t >= 1) return { islands: to, tension: 0 };
  if (t <= 0) return { islands: from, tension };
  const p = curve(t);
  const fadeOut = 1 - ease(Math.min(1, (t * MORPH_MS) / 140));
  const fadeIn = ease(Math.max(0, Math.min(1, (t * MORPH_MS - 180) / 240)));
  return {
    islands: plan.from.map((island, i) => ({
      left: island.left + (plan.to[i].left - island.left) * p,
      // Past the target (a springy curve) the edges may overshoot, but an
      // island never gets narrower than both of its shapes: a capsule that
      // thin would shrink in height too instead of wobbling.
      width: Math.max(
        island.width + (plan.to[i].width - island.width) * p,
        p > 1 ? Math.min(island.width, plan.to[i].width) : 0,
      ),
      radius: island.radius + (plan.to[i].radius - island.radius) * p,
      slot: plan.to[i].slot,
      blend:
        Math.abs(plan.to[i].left - island.left) > 0.001 ||
        Math.abs(plan.to[i].width - island.width) > 0.001 ||
        (tension > 0 && island.blend !== false),
      tint: (island.tint ?? 0) * fadeOut + (plan.to[i].tint ?? 0) * fadeIn,
    })),
    tension: tension * (1 - p) + (plan.simple ? 0 : 1800 * Math.sin(Math.PI * Math.min(1, p)) ** 2),
  };
}

/** A capsule's horizontal slice: y² < field(x). Negative values are real gaps. */
export function dockField(width: number, islands: DockIsland[], tension = 0, scales: { x: number; y: number }[] = []) {
  const ceiling = Math.max(...islands.map((island, i) => (island.radius * (scales[i]?.y ?? 1)) ** 2));
  const cores = islands.flatMap((island, i) => {
    if (island.width <= 0 || island.radius <= 0) return [];
    const sx = scales[i]?.x ?? 1;
    const r = Math.min(island.radius, island.width / 2);
    const center = island.left + island.width / 2;
    return [center - (island.width / 2 - r) * sx, center + (island.width / 2 - r) * sx];
  });
  const leftCore = Math.min(...cores),
    rightCore = Math.max(...cores);
  return Array.from({ length: samples + 1 }, (_, i) => {
    const x = (i / samples) * width;
    let value = -width * width;
    let stationary = -width * width;
    let plain = -width * width;
    for (const [index, island] of islands.entries()) {
      const { x: sx, y: sy } = scales[index] ?? { x: 1, y: 1 };
      const localX = (x - island.left - island.width / 2) / sx + island.left + island.width / 2;
      const r = Math.min(island.radius, island.width / 2);
      if (r <= 0) continue;
      const dx = Math.max(island.left + r - localX, 0, localX - (island.left + island.width - r));
      const next = (r * r - dx * dx) * sy * sy;
      plain = Math.max(plain, next);
      if (island.blend === false) {
        stationary = Math.max(stationary, next);
        continue;
      }
      // Smooth union draws a neck between nearby droplets, without double blur
      // or a border through the join. Distant islands remain separate.
      const h = tension ? Math.max(tension - Math.abs(value - next), 0) / tension : 0;
      value = Math.max(value, next) + h * h * tension * 0.25;
    }
    // Neck smoothing only joins inner edges, never inflates the outside edge.
    return Math.min(x < leftCore || x > rightCore ? plain : Math.max(value, stationary), ceiling);
  });
}

/** Trace one closed contour per connected region, including subpixel pinch-off. */
export function dockFieldPath(width: number, field: number[], center = 32) {
  const step = width / (field.length - 1);
  const contours: string[] = [];
  let points: [number, number][] = [];
  const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;
  const close = () => {
    if (points.length < 2) {
      points = [];
      return;
    }
    contours.push(
      `M ${points.map(([x, y]) => point(x, center - y)).join(" L ")} L ${points
        .reverse()
        .map(([x, y]) => point(x, center + y))
        .join(" L ")} Z`,
    );
    points = [];
  };
  for (let i = 0; i < field.length; i++) {
    const v = field[i];
    const prev = field[i - 1];
    if (v >= 0) {
      if (prev < 0) points.push([(i - 1 + -prev / (v - prev)) * step, 0]);
      points.push([i * step, Math.sqrt(v)]);
    } else if (prev >= 0) {
      points.push([(i - 1 + prev / (prev - v)) * step, 0]);
      close();
    }
  }
  close();
  return contours.join(" ");
}

export type DockScale = { x: number; y: number };

/** Exact arcs for simple capsules; sample a field only during an actual neck. */
export function dockContour(width: number, islands: DockIsland[], tension = 0, scales: DockScale[] = [], center = 32) {
  if (!islands.length) return "";
  if (tension > 0) return dockFieldPath(width, dockField(width, islands, tension, scales), center);
  const capsules = islands
    .flatMap((island, i) => {
      if (island.width <= 0 || island.radius <= 0) return [];
      const { x, y } = scales[i] ?? { x: 1, y: 1 };
      const r = Math.min(island.radius, island.width / 2);
      return [
        {
          left: island.left + (island.width * (1 - x)) / 2,
          right: island.left + (island.width * (1 + x)) / 2,
          rx: r * x,
          ry: r * y,
        },
      ];
    })
    .sort((a, b) => a.left - b.left);
  const merged: typeof capsules = [];
  for (const capsule of capsules) {
    const previous = merged.at(-1);
    if (previous && capsule.left < previous.right) {
      if (
        Math.abs(capsule.rx - previous.rx) < 0.001 &&
        Math.abs(capsule.ry - previous.ry) < 0.001 &&
        capsule.left + capsule.rx <= previous.right - previous.rx + 0.001
      ) {
        previous.right = Math.max(previous.right, capsule.right);
        continue;
      }
      return dockFieldPath(width, dockField(width, islands, tension, scales), center);
    }
    merged.push({ ...capsule });
  }
  const n = (value: number) => Number(value.toFixed(3));
  return merged
    .map(({ left, right, rx, ry }) => {
      const top = center - ry,
        bottom = center + ry;
      return `M ${n(left + rx)} ${n(top)} H ${n(right - rx)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(right)} ${n(center)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(right - rx)} ${n(bottom)} H ${n(left + rx)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(left)} ${n(center)} A ${n(rx)} ${n(ry)} 0 0 1 ${n(left + rx)} ${n(top)} Z`;
    })
    .join(" ");
}
