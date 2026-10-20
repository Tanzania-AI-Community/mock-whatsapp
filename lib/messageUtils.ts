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
    if (timestampA !== timestampB) return timestampA - timestampB

    // Timestamps are whole seconds; ids keep same-second messages in order
    if (typeof a.id === "number" && typeof b.id === "number") {
      return a.id - b.id
    }
    return 0
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

export function getLastMessageId(messages: Message[]): number | null {
  const ids = messages
    .map((message) => message.id)
    .filter((id): id is number => typeof id === "number")
  return ids.length > 0 ? Math.max(...ids) : null
}

// Database ids only increase, so messages saved after clearing stay visible
export function excludeClearedMessages(
  messages: Message[],
  clearedThroughId: number | null
): Message[] {
  if (clearedThroughId === null) return messages
  return messages.filter(
    (message) => typeof message.id !== "number" || message.id > clearedThroughId
  )
}

const normalizeContent = (content: string | null) => (content ?? "").trim()

// Each temporary message claims at most one saved copy: the oldest unclaimed user
// message with the same text and an id above its sentAfterId
export function reconcileTempMessages(
  tempMessages: Message[],
  savedMessages: Message[]
): Message[] {
  if (tempMessages.length === 0) return tempMessages

  const candidates = savedMessages
    .filter(
      (message): message is Message & { id: number } =>
        message.role === "user" && typeof message.id === "number"
    )
    .sort((a, b) => a.id - b.id)

  const claimedIds = new Set<number>()
  const lastClaimedIdByContent = new Map<string, number>()
  const unmatched = tempMessages.filter((temp) => {
    if (temp.status === "error") return true

    const content = normalizeContent(temp.content)
    const match = candidates.find(
      (saved) =>
        !claimedIds.has(saved.id) &&
        saved.id > (temp.sentAfterId ?? 0) &&
        normalizeContent(saved.content) === content
    )
    if (!match) return true

    claimedIds.add(match.id)
    lastClaimedIdByContent.set(
      content,
      Math.max(match.id, lastClaimedIdByContent.get(content) ?? 0)
    )
    return false
  })

  if (unmatched.length === tempMessages.length) return tempMessages

  // Later polls return the claimed copies again, so identical messages still
  // waiting may only match newer ones
  return unmatched.map((temp) => {
    const lastClaimedId = lastClaimedIdByContent.get(
      normalizeContent(temp.content)
    )
    return lastClaimedId !== undefined &&
      lastClaimedId > (temp.sentAfterId ?? 0)
      ? { ...temp, sentAfterId: lastClaimedId }
      : temp
  })
}
