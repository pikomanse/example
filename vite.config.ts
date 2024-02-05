import { defineConfig, loadEnv } from 'vite';
import solidPlugin from 'vite-plugin-solid';

const SOLID_APP_PREFIX = 'SOLID_APP_';
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), SOLID_APP_PREFIX);
  env[`${SOLID_APP_PREFIX}BUILD_DATE`] = new Date().toISOString().split('T')[0];
  console.log('env', env, process.env.NODE_ENV);
  return {
    plugins: [
      solidPlugin(),
    ],
    build: {
      target: 'esnext',
      polyfillDynamicImport: false,
      polyfillModulePreload: false,
    },
    define: {
      "process.env": env,
    }
  }
});
