import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rpcBrowser = path.resolve(
  __dirname,
  "node_modules/rpc-websockets/dist/index.browser.mjs",
);

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [
    nodePolyfills({
      include: ["buffer"],
      globals: { Buffer: true, global: true, process: false },
      protocolImports: true,
    }),
  ],
  vite: {
    resolve: {
      alias: [{ find: /^rpc-websockets$/, replacement: rpcBrowser }],
    },
    optimizeDeps: {
      include: ["@solana/web3.js", "@solana/spl-token", "buffer"],
      esbuildOptions: {
        alias: { "rpc-websockets": rpcBrowser },
        mainFields: ["browser", "module", "main"],
        conditions: ["browser", "module", "import", "default"],
      },
    },
  },
});
