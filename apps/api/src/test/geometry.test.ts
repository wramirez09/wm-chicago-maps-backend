import { describe, expect, it } from 'vitest';
import { dedupeConsecutive, metersToSegment, simplify } from '../jobs/ingest/geometry.js';

describe('geometry', () => {
  it('simplify keeps endpoints and drops collinear points', () => {
    expect(simplify([[0, 0], [1, 0.00001], [2, 0]], 0.001)).toEqual([[0, 0], [2, 0]]);
  });
  it('dedupeConsecutive removes repeats', () => {
    expect(dedupeConsecutive([[0, 0], [0, 0], [1, 1]])).toEqual([[0, 0], [1, 1]]);
  });
  it('metersToSegment is roughly right at Chicago latitude', () => {
    // 0.001° of latitude ≈ 111 m
    const d = metersToSegment([-87.63, 41.879], [-87.64, 41.878], [-87.62, 41.878]);
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(118);
  });
});
