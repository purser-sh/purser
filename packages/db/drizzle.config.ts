import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: new URL("./src/schema.sqlite.ts", import.meta.url).pathname,
  out: new URL("./drizzle", import.meta.url).pathname,
});
