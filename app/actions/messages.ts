"use server"

import { db } from "@/db"
import {
  buildMessagesFindManyOptions,
  formatDbMessage,
  type GetMessagesOptions,
} from "@/lib/messageQuery"
import { type Message } from "@/types/chat"

/**
 * Helper function to check if an error is a connection error
 */
function isConnectionError(error: unknown): boolean {
  const errorString = String(error)
  return (
    errorString.includes("ECONNREFUSED") ||
    errorString.includes("connection refused") ||
    errorString.includes("Connection terminated") ||
    (error instanceof AggregateError &&
      error.errors?.some((e) => String(e).includes("ECONNREFUSED")))
  )
}

export async function getMessages(options: GetMessagesOptions = {}): Promise<{
  messages: Message[]
  error?: string
}> {
  try {
    if (!db.query?.messages?.findMany) {
      console.error("Database connection error")
      return {
        messages: [],
        error: "DATABASE_CONNECTION_ERROR",
      }
    }

    const dbMessages = await db.query.messages.findMany(
      buildMessagesFindManyOptions(options)
    )

    // Always return an array, even if empty
    if (!dbMessages) {
      console.error("Database error: no messages found")
      return { messages: [] }
    }

    const formattedMessages: Message[] = dbMessages.map(formatDbMessage)

    return { messages: formattedMessages }
  } catch (error) {
    console.error("Database error:", error)
    return {
      messages: [],
      error: isConnectionError(error)
        ? "DATABASE_CONNECTION_ERROR"
        : "DATABASE_ERROR",
    }
  }
}
