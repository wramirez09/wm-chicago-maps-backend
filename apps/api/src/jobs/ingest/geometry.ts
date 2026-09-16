/** Small geometry helpers ported from the app's fetch-*.mjs scripts. */
export type Coord = [number, number];

export const round5 = (n: number) => Number(n.toFixed(5));

export function perpendicularDistance(p: Coord, a: Coord, b: Coord): number {
  const [px, py] = p, [ax, ay] = a, [bx, by] = b;
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas–Peucker, tolerance in degrees. */
export function simplify(points: Coord[], tolerance: number): Coord[] {
  if (points.length < 3) return points;
  let maxDist = 0, index = 0;
  const last = points.length - 1;
  for (let i = 1; i < last; i++) {
    const d = perpendicularDistance(points[i]!, points[0]!, points[last]!);
    if (d > maxDist) { maxDist = d; index = i; }
  }
  if (maxDist <= tolerance) return [points[0]!, points[last]!];
  return [...simplify(points.slice(0, index + 1), tolerance), ...simplify(points.slice(index), tolerance).slice(1)];
}

export function dedupeConsecutive(points: Coord[]): Coord[] {
  return points.filter((p, i) => i === 0 || p[0] !== points[i - 1]![0] || p[1] !== points[i - 1]![1]);
}

const METERS_PER_DEG_LAT = 111_320;

/** Metres from `point` to segment a–b via a local equirectangular projection. */
export function metersToSegment(point: Coord, a: Coord, b: Coord): number {
  const scale = Math.cos((point[1] * Math.PI) / 180) * METERS_PER_DEG_LAT;
  const px = (a[0] - point[0]) * scale, py = (a[1] - point[1]) * METERS_PER_DEG_LAT;
  const qx = (b[0] - point[0]) * scale, qy = (b[1] - point[1]) * METERS_PER_DEG_LAT;
  const dx = qx - px, dy = qy - py;
  if (dx === 0 && dy === 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, -(px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px + t * dx, py + t * dy);
}
