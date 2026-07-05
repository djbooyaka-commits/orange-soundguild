// Rewrite exports of Solana packages missing a resolver-compatible entry so
// Nitro/Cloudflare bundling succeeds. Adds `"."` subpath with node fallback +
// default so every resolver has a matching entry.
import fs from "node:fs";
import path from "node:path";

function browserish(dir) {
  const mjs = fs.existsSync(path.join(dir, "dist/index.browser.mjs"))
    ? "./dist/index.browser.mjs"
    : fs.existsSync(path.join(dir, "dist/index.mjs"))
      ? "./dist/index.mjs"
      : null;
  const cjs = fs.existsSync(path.join(dir, "dist/index.browser.cjs"))
    ? "./dist/index.browser.cjs"
    : fs.existsSync(path.join(dir, "dist/index.cjs"))
      ? "./dist/index.cjs"
      : null;
  return { mjs, cjs };
}

function nodeish(dir) {
  const mjs = fs.existsSync(path.join(dir, "dist/index.node.mjs"))
    ? "./dist/index.node.mjs"
    : fs.existsSync(path.join(dir, "dist/index.mjs"))
      ? "./dist/index.mjs"
      : null;
  const cjs = fs.existsSync(path.join(dir, "dist/index.node.cjs"))
    ? "./dist/index.node.cjs"
    : fs.existsSync(path.join(dir, "dist/index.cjs"))
      ? "./dist/index.cjs"
      : null;
  return { mjs, cjs };
}

const packages = [
  "node_modules/@solana/codecs",
  "node_modules/@solana/codecs-core",
  "node_modules/@solana/codecs-numbers",
  "node_modules/@solana/codecs-strings",
  "node_modules/@solana/codecs-data-structures",
  "node_modules/@solana/errors",
  "node_modules/@solana/options",
  "node_modules/rpc-websockets",
];

for (const dir of packages) {
  const pkgPath = path.resolve(dir, "package.json");
  if (!fs.existsSync(pkgPath)) continue;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const b = browserish(dir);
    const n = nodeish(dir);

    const isSolana = dir.includes("@solana/");
    // For Solana packages we want node build server-side (workerd), and browser build client-side.
    const dotExports = {};
    if (isSolana) {
      if (n.mjs || n.cjs) {
        dotExports.workerd = { import: n.mjs, require: n.cjs };
        dotExports["edge-light"] = { import: n.mjs, require: n.cjs };
        dotExports.node = { import: n.mjs, require: n.cjs };
      }
      if (b.mjs || b.cjs) {
        dotExports.browser = { import: b.mjs, require: b.cjs };
      }
      // Default: prefer browser build (works on workerd too)
      const defTarget = { import: b.mjs ?? n.mjs, require: b.cjs ?? n.cjs };
      dotExports.default = defTarget;
    } else {
      // rpc-websockets: browser build works everywhere including workerd
      const defTarget = { import: b.mjs ?? n.mjs, require: b.cjs ?? n.cjs };
      dotExports.browser = { import: b.mjs, require: b.cjs };
      dotExports.node = { import: n.mjs, require: n.cjs };
      dotExports.default = defTarget;
    }

    // Clean nulls
    for (const k of Object.keys(dotExports)) {
      const v = dotExports[k];
      if (v && typeof v === "object") {
        if (!v.import) delete v.import;
        if (!v.require) delete v.require;
      }
    }

    // Delete exports entirely; rely on main/module fields so Vite/Rollup's
    // strict conditional-exports resolver can't reject valid packages.
    delete pkg.exports;
    if (b.cjs) pkg.main = b.cjs;
    if (b.mjs) pkg.module = b.mjs;
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    console.log("[patch-solana] rewrote exports:", dir);
  } catch (e) {
    console.warn("[patch-solana] skip", dir, e?.message ?? e);
  }
}
