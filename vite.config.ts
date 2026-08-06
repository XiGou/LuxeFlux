import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // PWA: offline support for WebView & mobile browsers.
    // Capacitor ships the built "dist" folder into a native shell, so the
    // service worker is harmless there but keeps the pure-H5 build offline-capable.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'],
      manifest: {
        name: 'Luxe Flux — The $29,980 Match-3',
        short_name: 'Luxe Flux',
        description:
          'A satirical match-3 about luxury consumerism. Match logos, build your Prespend, earn the Birkin.',
        theme_color: '#0A0A0A',
        background_color: '#0A0A0A',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  base: './', // relative base: required for Capacitor file:// WebView serving
  build: {
    outDir: 'dist',
    target: 'es2018',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split heavy deps so the initial WebView/JS load stays snappy
          'vendor-react': ['react', 'react-dom', 'framer-motion'],
          'vendor-utils': ['canvas-confetti', 'howler', 'lucide-react'],
          // Phaser 3 引擎体积较大，独立分包便于长缓存
          'vendor-phaser': ['phaser']
        }
      }
    }
  },
  server: {
    host: true,
    port: 5173
  }
});
