import { build } from 'vite';
import config from '../vite.config.js';

// The configuration is already native ESM; it does not need an esbuild bundle.
await build({ ...config, configFile: false });
await import('./prerender.mjs');
