import { defineConfig } from "vite";
import { cpSync, existsSync } from "node:fs";

export default defineConfig({
  plugins: [
    {
      name: "copy-models",
      apply: "build",
      closeBundle() {
        // copies the whole models folder, including models/props, into the site
        if (existsSync("models")) cpSync("models", "dist/models", { recursive: true });
      },
    },
  ],
});
