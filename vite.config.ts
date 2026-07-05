import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    resolve: {
      conditions: ["workerd", "worker", "browser", "module", "import", "default"],
    },
    ssr: {
      resolve: {
        conditions: ["workerd", "worker", "browser", "module", "import", "default"],
        externalConditions: ["workerd", "worker", "browser", "module", "import", "default"],
      },
    },
  },
});
