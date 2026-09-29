// @ts-check
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

import { SITE_URL, BASE_PATH } from './site.config.mjs';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  base: BASE_PATH,
  output: 'static',
  devToolbar: { enabled: false },
  trailingSlash: 'ignore',
  integrations: [react()],

  vite: {
    plugins: [tailwindcss()]
  }
});
