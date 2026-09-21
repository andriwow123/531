import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed to GitHub Pages as a project site under /531/. The base only applies
// to `vite build` output so local dev / preview / tests stay at '/'. The router
// reads this via import.meta.env.BASE_URL (see src/ui/router.tsx), and the PWA
// manifest uses relative asset paths so icons/start_url resolve under the base.
// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/531/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      manifest: {
        name: '5/3/1',
        short_name: '531',
        description: 'A 5/3/1 strength training companion — plan cycles, log sets, track progression.',
        theme_color: '#16161A',
        background_color: '#16161A',
        display: 'standalone',
        start_url: '.',
        scope: '.',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'pwa-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
}))
