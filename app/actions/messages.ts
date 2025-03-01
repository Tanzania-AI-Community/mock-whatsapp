"use server"

import { mockMessages } from "@/data/mockMessages"
import { db } from "@/db"

import { type Message } from "@/types/chat"

/**
 * Server action to fetch messages directly from the database
 * Can be called from both server and client components
 */
export async function getMessages(limit: number = 100): Promise<Message[]> {
  try {
    // First check if db.query.messages exists
    if (!db.query?.messages?.findMany) {
      console.error("Database client is not properly initialized")
      return mockMessages
    }

    let dbMessages

    try {
      // Using drizzle ORM query builder
      dbMessages = await db.query.messages.findMany({
        limit,
        orderBy: (messages, { desc }) => [desc(messages.created_at)],
      })
    } catch (queryError) {
      console.error("Database query failed:", queryError)
      return mockMessages
    }

    // Check if we got results
    if (!dbMessages || dbMessages.length === 0) {
      console.log("No messages found in database, using mock data")
      return mockMessages
    }

    // Format the messages to match our frontend Message type
    const formattedMessages: Message[] = dbMessages.map((msg) => {
      // Convert created_at to timestamp if it exists
      const timestamp = msg.created_at
        ? Math.floor(new Date(msg.created_at).getTime() / 1000)
        : Math.floor(Date.now() / 1000)

      return {
        id: msg.id ?? crypto.randomUUID(),
        role: msg.role as Message["role"],
        content: msg.content ?? "",
        created_at: msg.created_at,
        timestamp: timestamp,
        status: "sent",
      }
    })

    return formattedMessages
  } catch (error) {
    console.error("Error fetching messages:", error)
    // Return mock data as fallback
    return mockMessages
  }
}
