import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3030",
      "/events": {
        target: "http://127.0.0.1:3030",
        ws: false
      }
    }
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: false
  }
});
