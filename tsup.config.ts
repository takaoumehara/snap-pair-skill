import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { defineConfig } from 'tsup';
import { CONFIG_JSON_SCHEMA } from './src/cli/config';

// Peer and runtime dependencies stay external so apps share one copy.
const external = ['react', 'react-dom', 'react/jsx-runtime', 'firebase', /^firebase\//, 'partysocket', 'qrcode'];

export default defineConfig([
  {
    // Library: ESM (.js) + CJS (.cjs) + declarations, with subpath entries for the exports map.
    entry: {
      index: 'src/index.ts',
      'hooks/useSnapPair': 'src/hooks/useSnapPair.ts',
      'transports/base': 'src/transports/base.ts',
      'transports/firebase': 'src/transports/firebase.ts',
      'transports/broadcast': 'src/transports/broadcast.ts',
      'transports/partykit': 'src/transports/partykit.ts',
      'transports/webrtc': 'src/transports/webrtc.ts',
    },
    format: ['esm', 'cjs'],
    dts: true,
    splitting: true,
    treeshake: true,
    sourcemap: false,
    clean: false, // `npm run build` removes dist/ first; two configs run in parallel.
    target: 'es2020',
    platform: 'neutral',
    external,
  },
  {
    // `snap-pair` bin: one self-contained ESM file for Node 18+ (the shebang comes from src/cli/index.ts).
    entry: { 'cli/index': 'src/cli/index.ts' },
    format: ['esm'],
    dts: false,
    clean: false,
    target: 'node18',
    platform: 'node',
    external,
    async onSuccess() {
      // Templates ship at <package>/templates, where dist/cli/index.js looks for them.
      rmSync('templates', { recursive: true, force: true });
      cpSync('src/templates', 'templates', { recursive: true });
      mkdirSync('dist', { recursive: true });
      writeFileSync('dist/config.schema.json', `${JSON.stringify(CONFIG_JSON_SCHEMA, null, 2)}\n`);
    },
  },
]);
