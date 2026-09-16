import { describe, expect, it } from 'vitest';
import { BboxParam, CHICAGO_BBOX } from './common.js';

describe('BboxParam', () => {
  it('parses and clamps to Chicago', () => {
    const r = BboxParam.parse('-90,40,-80,45');
    expect(r).toEqual({ west: CHICAGO_BBOX[0], south: CHICAGO_BBOX[1], east: CHICAGO_BBOX[2], north: CHICAGO_BBOX[3] });
  });
  it('rejects inverted boxes', () => {
    expect(() => BboxParam.parse('-87.6,41.9,-87.7,41.8')).toThrow();
  });
  it('rejects garbage', () => {
    expect(() => BboxParam.parse('a,b')).toThrow();
  });
});
