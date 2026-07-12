/// <reference types="vitest/config" />
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Resolve the API base URL at BUILD time. Vite only inlines client env vars that
// are prefixed VITE_, so a bare API_BASE_URL / NEXT_PUBLIC_* (Next.js convention)
// is invisible to the browser. We read all common names here from the build
// environment and inject the result as the __API_URL__ global, so any of them
// work. Set it in your build step (e.g. Cloudflare Workers Build variables) —
// runtime Worker vars do NOT work for a static SPA (values are baked in at build).
const API_URL =
  process.env.VITE_API_URL ||
  process.env.API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "";

// Dev proxy: the browser calls same-origin `/v1/*`, Vite forwards to the local
// API — avoids CORS + the self-signed cert. `secure:false` accepts the local
// self-signed certificate.
export default defineConfig({
  define: {
    __API_URL__: JSON.stringify(API_URL),
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/v1": {
        target: "https://api.billwise.localhost",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  test: {environment: "jsdom", setupFiles: "./src/test/setup.ts"},
});
