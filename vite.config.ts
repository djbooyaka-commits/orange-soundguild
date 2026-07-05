import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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
    optimizeDeps: {
      include: ["@solana/web3.js", "@solana/spl-token", "buffer"],
      esbuildOptions: {
        conditions: ["browser", "module", "import", "default"],
        mainFields: ["browser", "module", "main"],
      },
    },
    resolve: {
      conditions: ["browser", "module", "import", "default"],
    },
  },
});
