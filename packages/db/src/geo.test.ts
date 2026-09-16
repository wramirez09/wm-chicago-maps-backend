import { describe, expect, it } from 'vitest';
import { withinBbox } from './geo.js';

describe('geo helpers', () => {
  it('builds an envelope filter', () => {
    const s = withinBbox('col', { west: -87.7, south: 41.8, east: -87.6, north: 41.9 });
    expect(s).toBeDefined();
  });
});
