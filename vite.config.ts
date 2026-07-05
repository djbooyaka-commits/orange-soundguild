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
});
