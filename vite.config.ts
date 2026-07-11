/// <reference types="vitest/config" />
import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev proxy: the browser calls same-origin `/v1/*`, Vite forwards to the local
// API — avoids CORS + the self-signed cert. In prod, VITE_API_URL points at the
// real API origin. `secure:false` accepts the local self-signed certificate.
export default defineConfig({
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
