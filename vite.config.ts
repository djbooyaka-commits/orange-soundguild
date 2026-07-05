import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [
        {
          find: /^rpc-websockets$/,
          replacement: "rpc-websockets/dist/index.browser.mjs",
        },
      ],
    },
  },
});
