import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * H5 部署子路径（默认 './'，即相对路径）。
 *
 * - 本地开发 / Capacitor 原生壳：必须保持相对路径 './'，
 *   原生 WebView 以 file:// / capacitor:// 加载，绝对路径会直接 404。
 * - GitHub Pages（项目页）：站点挂在 https://<user>.github.io/<repo>/ 子路径下，
 *   CI 里通过环境变量 BASE_PATH=/<repo>/ 注入，保证资源、PWA 清单与 Service Worker
 *   的 scope 都落在子路径内，而不是错误地指向域名根目录。
 */
const base = process.env.BASE_PATH || './';
/** PWA 清单的 start_url / scope 必须落在同一子路径下，否则 PWA 无法安装 */
const pwaBase = base === './' ? './' : base;

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
        theme_color: '#FBF8F1',
        background_color: '#FBF8F1',
        display: 'standalone',
        orientation: 'portrait',
        start_url: pwaBase,
        scope: pwaBase,
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
  base, // './' for Capacitor file:// WebView; BASE_PATH=/<repo>/ for GitHub Pages
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
    port: 5173,
    allowedHosts: [
      't86xn79nv7-5173.cnb.run'
    ]
  }
});
