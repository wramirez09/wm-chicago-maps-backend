import { describe, expect, it } from 'vitest';
import { parseCtaTime } from '../upstream/cta.js';
import { decodePolyline6 } from '../upstream/valhalla.js';

describe('parseCtaTime', () => {
  it('reads CTA compact timestamps as Chicago local time', () => {
    // 2026-01-15 is CST (UTC-6): 08:30 local → 14:30Z
    expect(parseCtaTime('20260115 08:30').toISOString()).toBe('2026-01-15T14:30:00.000Z');
    // 2026-07-15 is CDT (UTC-5)
    expect(parseCtaTime('2026-07-15T08:30:00').toISOString()).toBe('2026-07-15T13:30:00.000Z');
  });
});

describe('decodePolyline6', () => {
  it('round-trips points encoded at 1e6 precision', () => {
    const input: [number, number][] = [[-87.6298, 41.8781], [-87.6359, 41.8789], [-87.6051, 41.8919]];
    const pts = decodePolyline6(encode6(input));
    expect(pts.length).toBe(3);
    input.forEach(([lng, lat], i) => {
      expect(pts[i]![0]).toBeCloseTo(lng, 5);
      expect(pts[i]![1]).toBeCloseTo(lat, 5);
    });
  });
});

/** Reference encoder (Google polyline algorithm, 1e6). */
function encode6(points: [number, number][]): string {
  let out = '', prevLat = 0, prevLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1;
    let s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lng, lat] of points) {
    const la = Math.round(lat * 1e6), ln = Math.round(lng * 1e6);
    out += enc(la - prevLat) + enc(ln - prevLng);
    prevLat = la; prevLng = ln;
  }
  return out;
}
