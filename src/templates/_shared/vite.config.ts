import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // `npm run dev -- --host` exposes the dev server on your LAN so phones can join.
  server: { host: false },
});
