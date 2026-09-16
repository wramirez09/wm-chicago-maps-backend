import { defineConfig } from 'tsup';
export default defineConfig({
  entry: { index: 'src/index.ts', worker: 'src/worker.ts', 'jobs/run': 'src/jobs/run.ts', migrate: 'src/migrate.ts' },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Workspace packages are bundled in; everything else stays external.
  noExternal: ['@wm/db', '@wm/shared'],
});
