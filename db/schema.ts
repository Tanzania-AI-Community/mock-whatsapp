import { sql } from "drizzle-orm"
import { pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core"

// Define MessageRole enum to match Python enum
export const MessageRole = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
} as const

export type MessageRoleType = (typeof MessageRole)[keyof typeof MessageRole]

// Messages table matching the SQLModel structure
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content"),
  tool_name: varchar("tool_name", { length: 255 }),
  created_at: timestamp("created_at", { withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  // you could add other fields here
})

// Types for TypeScript
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
