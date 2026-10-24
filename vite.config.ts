/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json' with { type: 'json' }

// Vite = the build tool. It turns our TypeScript/React source into plain
// HTML/JS/CSS files in the "dist" folder that any web host can serve.
//
//   npm run build          -> dist/          the real installable, offline app
//   npm run build:preview  -> dist-preview/  same app without offline support,
//                                            used for the quick claude.ai test link
export default defineConfig(({ mode }) => ({
  // Relative paths so the app works from any folder (e.g. GitHub Pages /clay-scores/).
  base: './',
  // Shows the version on the home screen so you can tell when an update arrived.
  define: { __APP_VERSION__: JSON.stringify(pkg.version + (mode === 'preview' ? '-preview' : '')) },
  build: { outDir: mode === 'preview' ? 'dist-preview' : 'dist' },
  plugins: [
    react(),
    // Makes the app installable ("Add to Home Screen") and work offline by
    // caching all of its files on the phone with a "service worker".
    mode !== 'preview' &&
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'Clay Scores',
          short_name: 'Clay Scores',
          description: 'Sporting clays score tracker',
          theme_color: '#000000',
          background_color: '#000000',
          display: 'standalone',
          orientation: 'portrait',
          start_url: './',
          icons: [
            { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
      }),
  ],
  test: { environment: 'node' },
}))
