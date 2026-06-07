import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    target: "chrome120",
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) {
            return "react-core";
          }
          if (id.includes("@tanstack/react-query")) {
            return "query";
          }
          if (id.includes("react-markdown") || id.includes("remark-gfm")) {
            return "markdown";
          }
          if (id.includes("@tanstack/react-virtual")) {
            return "virtual";
          }
          if (id.includes("lucide-react")) {
            return "ui-icons";
          }
        }
      }
    },
    chunkSizeWarningLimit: 800
  }
});
