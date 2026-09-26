import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API is served by the Rust binary on :8080 in development; Vite proxies
// /api so cookies are same-origin and CSRF checks behave like production.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: false } },
  },
  build: {
    target: "es2022",
    sourcemap: false,
    rollupOptions: {
      output: {
        // Keep the heavy, rarely-changing libraries in their own chunks so a
        // content deploy doesn't invalidate the learner's cached editor.
        manualChunks(id: string) {
          if (id.includes("node_modules/mermaid")) return "mermaid";
          if (id.includes("@codemirror") || id.includes("@uiw/react-codemirror")) return "editor";
          if (/node_modules\/(react-markdown|remark-|rehype-|micromark|mdast|hast|unified|katex)/.test(id)) return "markdown";
          return undefined;
        },
      },
    },
  },
  worker: { format: "es" },
});
