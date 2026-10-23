import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solidPlugin()],
  server: {
    port: 3000,
    // Join tokens come from server.mjs, which holds the private key.
    proxy: { '/pikoman': 'http://localhost:3001' },
  },
  build: { target: 'esnext' },
});
