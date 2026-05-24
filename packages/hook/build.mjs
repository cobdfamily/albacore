// Hook build pipeline. Bundles src/main.ts (which
// imports @cobd/core) into dist/main.js, then copies
// src/index.html to dist/. esbuild only -- no
// bundler config file, no plugins; if we outgrow
// this we can split it out.
//
// Run with `--watch` for incremental rebuilds during
// renderer development.

import * as esbuild from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = resolve(here, "src");
const distDir = resolve(here, "dist");
const watch = process.argv.includes("--watch");

await mkdir(distDir, { recursive: true });
await cp(resolve(srcDir, "index.html"), resolve(distDir, "index.html"));

const options = {
    entryPoints: [resolve(srcDir, "main.ts")],
    bundle: true,
    format: "esm",
    outfile: resolve(distDir, "main.js"),
    target: ["es2022"],
    platform: "browser",
    sourcemap: true,
    logLevel: "info",
};

if (watch) {
    const ctx = await esbuild.context(options);
    await ctx.watch();
    console.log("hook: watching for changes...");
} else {
    await esbuild.build(options);
    console.log("hook: built dist/");
}
