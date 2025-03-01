import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.string().url(),
    // WhatsApp API environment variables
    WHATSAPP_API_URL: z.string().url(),
    WHATSAPP_API_TOKEN: z.string(),
  },

  /**
   * Specify your client-side environment variables schema here.
   */
  client: {
    // No client-side environment variables needed for now
  },

  /**
   * Runtime environment variables
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    WHATSAPP_API_URL: process.env.WHATSAPP_API_URL,
    WHATSAPP_API_TOKEN: process.env.WHATSAPP_API_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
