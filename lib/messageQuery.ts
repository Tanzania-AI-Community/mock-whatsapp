import { type Message as DbMessage } from "@/db/schema"
import { type Message } from "@/types/chat"

export interface GetMessagesOptions {
  limit?: number
  userId?: number
}

export function buildMessagesFindManyOptions({
  limit = 100,
  userId,
}: GetMessagesOptions = {}) {
  const shouldFilterByUserId =
    typeof userId === "number" && Number.isSafeInteger(userId) && userId > 0

  return {
    limit,
    where: (messages: any, { and, eq, or }: any) => {
      const filters = [
        eq(messages.is_present_in_conversation, true),
        or(eq(messages.role, "user"), eq(messages.role, "assistant")),
      ]

      if (shouldFilterByUserId) {
        filters.push(eq(messages.user_id, userId))
      }

      return and(...filters)
    },
    orderBy: (messages: any, { desc }: any) => [desc(messages.created_at)],
  }
}

export function formatDbMessage(message: DbMessage): Message {
  return {
    id: message.id ?? crypto.randomUUID(),
    user_id: message.user_id ?? undefined,
    role: message.role as Message["role"],
    content: message.content ?? "",
    tool_name: message.tool_name ?? null,
    created_at: message.created_at,
    timestamp: message.created_at
      ? Math.floor(new Date(message.created_at).getTime() / 1000)
      : Math.floor(Date.now() / 1000),
    status: "sent",
  }
}
