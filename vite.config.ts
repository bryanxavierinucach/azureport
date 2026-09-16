import tailwindcss from '@tailwindcss/vite';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';
import vinext from 'vinext';

export default defineConfig({
  plugins: [tailwindcss(), vinext(), nitro({ preset: 'netlify' })],
});
