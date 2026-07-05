import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const rpcWsBrowser = fileURLToPath(
  new URL("./node_modules/rpc-websockets/dist/index.browser.mjs", import.meta.url),
);

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
