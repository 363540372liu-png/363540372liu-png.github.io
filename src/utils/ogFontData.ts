import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// These are the same local fonts registered in astro.config.ts. Read them
// directly during prerendering so the build doesn't need an HTTP asset server.
export function ogFontData() {
  return Promise.all(
    ["Regular.ttf", "Bold.ttf"].map(file =>
      readFile(resolve("public", "fonts", file))
    )
  );
}
