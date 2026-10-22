import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: 'https://qrisnamis.pages.dev',
  output: 'static',
  vite: { plugins: [tailwindcss()] },
})
