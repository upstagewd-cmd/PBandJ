import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { VitePWA } from "vite-plugin-pwa";

const port = Number(process.env.PORT || 5173);

const basePath = process.env.BASE_PATH || "/";

// Normalize: strip trailing slash, collapse "/" → ""
const basePrefix = basePath === "/" ? "" : basePath.replace(/\/$/, "");

export default defineConfig({
  base: basePath,

  plugins: [
    react(),
    tailwindcss({ optimize: false }),

    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      scope: `${basePrefix}/`,
      base: `${basePrefix}/`,

      includeAssets: [
        "logo-favicon.png",
        "logo-main-transparent.png",
        "logo-simplified-transparent.png",
        "logo-secondary-transparent.png",
        "icons/*.png",
        "fonts/*.ttf",
      ],

      manifest: {
        name: "PB&J",
        short_name: "PB&J",
        description:
          "A men's pickleball community app for tournaments, open play, rankings, and fellowship.",
        theme_color: "#111111",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: `${basePrefix}/`,
        scope: `${basePrefix}/`,

        icons: [
          {
            src: `${basePrefix}/icons/icon-192.png`,
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${basePrefix}/icons/icon-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: `${basePrefix}/icons/icon-maskable-512.png`,
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },

      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,woff2,ttf}",
        ],
        navigateFallback: `${basePrefix}/offline.html`,
        navigateFallbackDenylist: [/^\/api\//, /^\/ws/],
        runtimeCaching: [],
      },

      devOptions: {
        enabled: false,
      },
    }),
  ],

  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(
        import.meta.dirname,
        "..",
        "..",
        "attached_assets",
      ),
    },

    dedupe: ["react", "react-dom"],
  },

  root: path.resolve(import.meta.dirname),

  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },

  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,

    proxy: {
      "/api": {
        target: process.env.API_URL || "http://localhost:5000",
        changeOrigin: true,
        secure: false,
      },
    },

    fs: {
      strict: true,
    },
  },

  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
