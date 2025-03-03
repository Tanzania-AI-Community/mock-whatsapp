"use server"

import { db } from "@/db"

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

export async function getMessages(limit: number = 100): Promise<{
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

    const dbMessages = await db.query.messages.findMany({
      limit,
      orderBy: (messages, { desc }) => [desc(messages.created_at)],
    })

    // Always return an array, even if empty
    if (!dbMessages) {
      console.error("Database error: no messages found")
      return { messages: [] }
    }

    const formattedMessages: Message[] = dbMessages.map((msg) => ({
      id: msg.id ?? crypto.randomUUID(),
      role: msg.role as Message["role"],
      content: msg.content ?? "",
      created_at: msg.created_at,
      timestamp: msg.created_at
        ? Math.floor(new Date(msg.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000),
      status: "sent",
    }))

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
