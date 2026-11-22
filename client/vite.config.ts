/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The backend runs on :8000; /api/* is forwarded without the prefix (like nginx in Docker).
const api = {
  target: "http://localhost:8000",
  changeOrigin: true,
  ws: true,
  rewrite: (path: string) => path.replace(/^\/api/, ""),
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 3000, proxy: { "/api": api } },
  test: {
    environment: "jsdom",
    globals: true, // lets Testing Library auto-cleanup between tests
    include: ["src/**/*.test.tsx"],
  },
});
