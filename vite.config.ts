import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        { find: /^node:buffer$/, replacement: "buffer" },
        { find: /^buffer$/, replacement: "buffer/" },
      ],
    },
    define: {
      global: "globalThis",
    },
    optimizeDeps: {
      include: ["buffer"],
    },
  },
});
