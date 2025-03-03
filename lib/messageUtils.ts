import { format, isSameDay, isToday, isYesterday } from "date-fns"

import { type Message } from "@/types/chat"

/**
 * Sort messages by timestamp and handle temporary messages
 */
export function sortMessages(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    // Temporary messages always at the end
    if (a.isTemp && !b.isTemp) return 1
    if (!a.isTemp && b.isTemp) return -1

    // Otherwise sort by timestamp
    const timestampA = getMessageTimestamp(a)
    const timestampB = getMessageTimestamp(b)
    return timestampA - timestampB
  })
}

/**
 * Get timestamp from message in a consistent format
 */
export function getMessageTimestamp(message: Message): number {
  return (
    message.timestamp ||
    (message.created_at
      ? Math.floor(new Date(message.created_at).getTime() / 1000)
      : 0)
  )
}

/**
 * Format date divider text
 */
export function formatDateDivider(timestamp: number): string {
  const date = new Date(timestamp * 1000)
  if (isToday(date)) return "Today"
  if (isYesterday(date)) return "Yesterday"
  return format(date, "MMMM d, yyyy")
}

/**
 * Group messages by date
 */
export function groupMessagesByDate(
  messages: Message[]
): { date: number; messages: Message[] }[] {
  const groups: { date: number; messages: Message[] }[] = []

  sortMessages(messages).forEach((message) => {
    const timestamp = getMessageTimestamp(message)
    const lastGroup = groups[groups.length - 1]
    const messageDate = new Date(timestamp * 1000)

    if (
      !lastGroup ||
      !isSameDay(new Date(lastGroup.date * 1000), messageDate)
    ) {
      groups.push({ date: timestamp, messages: [message] })
    } else {
      lastGroup.messages.push(message)
    }
  })

  return groups
}

/**
 * Check if scrolling should be triggered
 */
export function shouldTriggerScroll(
  newMessages: Message[],
  prevLength: number,
  isUserMessage: boolean,
  isAutoScrollEnabled: boolean
): boolean {
  const hasNewMessages = newMessages.length > prevLength
  return hasNewMessages && (isUserMessage || isAutoScrollEnabled)
}
