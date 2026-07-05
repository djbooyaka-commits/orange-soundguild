import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const bufferPath = require.resolve("buffer/");

function bufferAliasPlugin(): Plugin {
  return {
    name: "force-buffer-alias",
    enforce: "pre",
    resolveId(id) {
      if (id === "buffer" || id === "node:buffer") {
        return bufferPath;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [bufferAliasPlugin()],
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      include: ["buffer"],
    },
  },
});
