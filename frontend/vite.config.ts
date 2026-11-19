import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // `npm run dev` in docker compose proxies to the backend service. `vite preview`
  // (the built static site) uses the same proxy, so locally it plays Firebase
  // Hosting's `/api/**` rewrite to Cloud Run: set API_PROXY_TARGET=http://localhost:8080.
  server: {
    proxy: {
      "/api": process.env.API_PROXY_TARGET ?? "http://backend:8000",
    },
  },
});
