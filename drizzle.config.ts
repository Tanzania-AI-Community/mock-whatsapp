import { defineConfig } from "drizzle-kit"

import { env } from "./env.js"

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
