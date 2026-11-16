import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri: the dev server must run on a fixed port.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1420, strictPort: true },
  build: { target: "es2022" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
