/// <reference types="vitest/config" />
import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Resolve the API base URL at BUILD time. Vite only inlines client env vars that
// are prefixed VITE_, so a bare API_BASE_URL / NEXT_PUBLIC_* (Next.js convention)
// is invisible to the browser. We read all common names here from the build
// environment and inject the result as the __API_URL__ global, so any of them
// work. Set it in your build step (e.g. Cloudflare Workers Build variables) —
// runtime Worker vars do NOT work for a static SPA (values are baked in at build).
// Dev proxy: the browser calls same-origin `/v1/*`, Vite forwards to the local
// API — avoids CORS + the self-signed cert. `secure:false` accepts the local
// self-signed certificate.
export default defineConfig(({command, mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const API_URL =
    process.env.VITE_API_URL ||
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    env.VITE_API_URL ||
    env.API_BASE_URL ||
    env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  const API_ORIGIN = (() => {
    if (!API_URL) return "";
    // Root-relative API URLs use the current origin and are already covered by
    // `connect-src 'self'` (the local dev setup uses `/v1` via Vite's proxy).
    if (API_URL.startsWith("/") && !API_URL.startsWith("//")) return "";
    try {
      return new URL(API_URL).origin;
    } catch {
      throw new Error("The configured API URL must be absolute or root-relative for CSP generation.");
    }
  })();

  return {
  define: {
    __API_URL__: JSON.stringify(API_URL),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "billwise-csp-api-origin",
      transformIndexHtml: (html: string) => html
        .split("__BILLWISE_API_ORIGIN__").join(API_ORIGIN)
        // Vite injects compiled CSS as inline <style> tags while serving. Keep
        // production strict: its extracted stylesheet is covered by 'self'.
        .split("__BILLWISE_STYLE_SOURCES__")
        .join(command === "serve"
          ? "'unsafe-inline'"
          : "'sha256-38RhXrc7EdReTKsOm23ZPOCUgniTUUcjky8QOOrQx6o=' 'sha256-gYiS/BvZvRcK27JIXTuwhZ3hs2+VJ1X+2gUlE+farlg='")
        .split("__BILLWISE_UPGRADE_INSECURE_REQUESTS__")
        .join(command === "build" && API_ORIGIN.startsWith("https://") ? "upgrade-insecure-requests" : ""),
    },
  ],
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
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    exclude: ["e2e/**", "node_modules/**", "dist/**"],
  },
  };
});
