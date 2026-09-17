/**
 * The hand-written landmark seeds from the mobile repo's src/data/landmarks.ts,
 * now rows in `places` with category=landmark.
 * In a container: `node dist/seed.js`. On the host: `pnpm --filter @wm/api seed`.
 */
import { createDb, places, pointFrom } from '@wm/db';
import { loadEnv } from '../env.js';

const SEEDS = [
  { slug: 'cloud-gate', name: 'Cloud Gate', area: 'loop', lng: -87.6233, lat: 41.8827 },
  { slug: 'willis-tower', name: 'Willis Tower', area: 'loop', lng: -87.6359, lat: 41.8789 },
  { slug: 'navy-pier', name: 'Navy Pier', area: 'near-north-side', lng: -87.6051, lat: 41.8919 },
  { slug: 'wrigley-field', name: 'Wrigley Field', area: 'lake-view', lng: -87.6553, lat: 41.9484 },
  { slug: 'museum-of-science-and-industry', name: 'Museum of Science and Industry', area: 'hyde-park', lng: -87.5831, lat: 41.7906 },
  { slug: 'garfield-park-conservatory', name: 'Garfield Park Conservatory', area: 'east-garfield-park', lng: -87.7173, lat: 41.8864 },
  { slug: 'the-606', name: 'The 606', area: 'logan-square', lng: -87.6987, lat: 41.9136 },
  { slug: 'pullman-national-historical-park', name: 'Pullman National Historical Park', area: 'pullman', lng: -87.6093, lat: 41.6893 },
];

const env = loadEnv();
const { db, close } = createDb(env.DATABASE_URL, { max: 1, prepare: false });
try {
  for (const s of SEEDS) {
    await db
      .insert(places)
      .values({ slug: s.slug, name: s.name, category: 'landmark', independence: 'excluded', independenceReason: 'Public landmark, not a business', communityArea: null, location: pointFrom(s.lng, s.lat) as never, tags: ['landmark', s.area] })
      .onConflictDoNothing();
  }
  console.log(`seeded ${SEEDS.length} landmarks`);
} finally {
  await close();
}
