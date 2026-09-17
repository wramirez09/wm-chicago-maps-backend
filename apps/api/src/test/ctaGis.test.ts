/**
 * Parsers for CTA's published GIS extracts. The fixtures in
 * `src/upstream/__fixtures__/` are verbatim rows from the Chicago data portal,
 * trimmed for size; nothing here touches the network.
 */
import { describe, expect, it } from 'vitest';
import { parseBusRoutes, parseBusStops, parseRailStops } from '../upstream/ctaGis.js';
import { mapIdFor } from '../jobs/ingest/layers.js';
import railStopsFixture from '../upstream/__fixtures__/cta-rail-stops.json' with { type: 'json' };
import busStopsFixture from '../upstream/__fixtures__/cta-bus-stops.json' with { type: 'json' };
import busRoutesFixture from '../upstream/__fixtures__/cta-bus-routes.json' with { type: 'json' };

describe('parseRailStops', () => {
  it('collapses the per-direction rows to one entry per map_id', () => {
    const stops = parseRailStops(railStopsFixture);
    // The fixture holds 12 direction rows across 5 distinct stations.
    expect(railStopsFixture.length).toBe(12);
    expect(stops).toHaveLength(5);
    expect(new Set(stops.map((s) => s.mapId)).size).toBe(5);
    expect(stops.every((s) => s.mapId.startsWith('4'))).toBe(true);
  });

  it('keeps the two distinct Belmont stations apart', () => {
    const belmont = parseRailStops(railStopsFixture).filter((s) => s.name === 'Belmont');
    expect(belmont.map((s) => s.mapId).sort()).toEqual(['40060', '41320']);
  });

  it('drops rows with no map_id, name or location', () => {
    expect(parseRailStops([{ map_id: '40000' }, { station_name: 'Nowhere' }, {}])).toEqual([]);
  });
});

describe('mapIdFor', () => {
  const stops = parseRailStops(railStopsFixture);

  it('picks the nearby station, not the one that merely shares a name', () => {
    // Belmont on the Blue Line, ~5 km west of the Red/Brown/Purple Belmont.
    expect(mapIdFor('Belmont', [-87.71236, 41.93813], stops)).toBe('40060');
    expect(mapIdFor('Belmont', [-87.65338, 41.93975], stops)).toBe('41320');
  });

  it('returns null when nothing is close enough', () => {
    expect(mapIdFor('Belmont', [-87.9, 41.7], stops)).toBeNull();
  });

  it('prefers an exact name match over a marginally nearer stop', () => {
    const near = [
      { mapId: '40001', name: 'Other', point: [-87.65338, 41.93975] as [number, number] },
      { mapId: '41320', name: 'Belmont', point: [-87.6534, 41.9398] as [number, number] },
    ];
    expect(mapIdFor('Belmont', [-87.65338, 41.93975], near)).toBe('41320');
  });

  it('tolerates punctuation differences between OSM and CTA names', () => {
    const stops = [{ mapId: '40890', name: "O'Hare", point: [-87.9, 41.98] as [number, number] }];
    expect(mapIdFor('O Hare', [-87.9, 41.98], stops)).toBe('40890');
  });
});

describe('parseBusStops', () => {
  it('reads the float-formatted systemstop as a Bus Tracker stpid', () => {
    const stops = parseBusStops(busStopsFixture);
    expect(stops[0]).toMatchObject({ stopId: '15189', name: 'Cicero & Berteau', routes: '54, 54A' });
    expect(stops[0]!.point).toEqual([-87.74750923800002, 41.956892084]);
  });

  it('normalises the routes list the way rail stations join line names', () => {
    expect(parseBusStops(busStopsFixture).every((s) => !s.routes.includes(',,'))).toBe(true);
    expect(parseBusStops([{ ...busStopsFixture[0]!, routesstpg: ' 9 , X9 ,' }])[0]!.routes).toBe('9, X9');
  });

  it('keeps a stop with an unusable id but records it as null', () => {
    const rows = [{ ...busStopsFixture[0]!, systemstop: '' }];
    expect(parseBusStops(rows)[0]).toMatchObject({ stopId: null, name: 'Cicero & Berteau' });
  });

  it('falls back to the cross-streets when there is no public name', () => {
    const { public_nam: _drop, ...noName } = busStopsFixture[0]!;
    expect(parseBusStops([noName])[0]!.name).toBe('CICERO & BERTEAU (north leg)');
  });

  it('skips rows without point geometry', () => {
    const { the_geom: _drop, ...noGeom } = busStopsFixture[0]!;
    expect(parseBusStops([noGeom])).toEqual([]);
  });
});

describe('parseBusRoutes', () => {
  it('keeps every part of a route MultiLineString', () => {
    const routes = parseBusRoutes(busRoutesFixture);
    expect(routes.map((r) => r.route).sort()).toEqual(['106', '57']);
    const laramie = routes.find((r) => r.route === '57')!;
    expect(laramie.name).toBe('LARAMIE');
    expect(laramie.parts).toHaveLength(2);
    expect(laramie.parts[0]![0]).toEqual([-87.75480000023407, 41.872929999614335]);
  });

  it('accepts a plain LineString as one part', () => {
    const rows = [{ route: '1', name: 'X', the_geom: { type: 'LineString', coordinates: [[-87.6, 41.8], [-87.61, 41.81]] } }];
    expect(parseBusRoutes(rows)[0]!.parts).toEqual([[[-87.6, 41.8], [-87.61, 41.81]]]);
  });

  it('drops degenerate and malformed geometry', () => {
    expect(parseBusRoutes([{ route: '1', the_geom: { type: 'LineString', coordinates: [[-87.6, 41.8]] } }])).toEqual([]);
    expect(parseBusRoutes([{ route: '1', the_geom: { type: 'MultiLineString', coordinates: [[['a', 'b'], ['c', 'd']]] } }])).toEqual([]);
    expect(parseBusRoutes([{ name: 'no route', the_geom: { type: 'LineString', coordinates: [[-87.6, 41.8], [-87.61, 41.81]] } }])).toEqual([]);
  });
});
