import { defineConfig } from "vite";

// Relative base so the built files load when itch.io hosts the zip
// from a subdirectory instead of the domain root.
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
  },
});
