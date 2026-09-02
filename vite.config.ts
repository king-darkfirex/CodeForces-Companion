import { defineConfig } from "vite";
import { crx, type ManifestV3Export } from "@crxjs/vite-plugin";
import manifest from "./manifest.json";

// @crxjs/vite-plugin reads the manifest, discovers the popup HTML and the
// background service worker referenced inside it, and bundles each as a
// proper entry point (resolving all relative imports) — so `manifest.json`
// can point straight at .ts/.html source files instead of pre-built output.
export default defineConfig({
  plugins: [crx({ manifest: manifest as ManifestV3Export })],
});
