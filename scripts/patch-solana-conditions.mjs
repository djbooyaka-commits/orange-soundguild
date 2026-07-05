// Patches Solana packages that omit a `default` export condition so Nitro/workerd builds resolve them.
import fs from "node:fs";
import path from "node:path";

const targets = [
  {
    file: "node_modules/@solana/codecs/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/codecs-core/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/codecs-numbers/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/codecs-strings/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/codecs-data-structures/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/errors/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/@solana/options/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
  {
    file: "node_modules/rpc-websockets/package.json",
    def: {
      import: "./dist/index.browser.mjs",
      require: "./dist/index.browser.cjs",
    },
  },
];

for (const t of targets) {
  const p = path.resolve(t.file);
  if (!fs.existsSync(p)) continue;
  try {
    const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
    if (!pkg.exports || typeof pkg.exports !== "object") continue;
    // Some packages export multiple keys; only patch when there's a "." entry
    // or when exports is directly the "." shape.
    const dotEntry = pkg.exports["."];
    if (dotEntry && typeof dotEntry === "object" && !dotEntry.default) {
      dotEntry.default = t.def;
      pkg.exports["."] = dotEntry;
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
      console.log("[patch-solana] added default to", t.file);
    } else if (!("." in pkg.exports) && !pkg.exports.default) {
      pkg.exports = { ...pkg.exports, default: t.def };
      fs.writeFileSync(p, JSON.stringify(pkg, null, 2));
      console.log("[patch-solana] added default to", t.file);
    }
  } catch (e) {
    console.warn("[patch-solana] skip", t.file, e?.message ?? e);
  }
}
