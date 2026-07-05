import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const rpcWsBrowser = require.resolve("rpc-websockets/dist/index.browser.mjs");

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      alias: [{ find: /^rpc-websockets$/, replacement: rpcWsBrowser }],
    },
  },
});
