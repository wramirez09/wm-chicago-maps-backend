import { defineConfig } from 'tsup';
export default defineConfig({
  // Every entry here is runnable inside the deployed container, which ships dist/ and
  // production deps only — no tsx, no src/. Adding a CLI means adding it here too.
  entry: {
    index: 'src/index.ts',
    worker: 'src/worker.ts',
    'jobs/run': 'src/jobs/run.ts',
    migrate: 'src/migrate.ts',
    seed: 'src/seed/landmarks.ts',
  },
  format: ['esm'],
  target: 'node22',
  platform: 'node',
  sourcemap: true,
  clean: true,
  splitting: false,
  // Workspace packages are bundled in; everything else stays external.
  noExternal: ['@wm/db', '@wm/shared'],
});
