import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

import { isDisplayRole, type Message } from "@/types/chat"

// Utility function for combining Tailwind CSS classes
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {}
) {
  return new Intl.DateTimeFormat("en-US", {
    month: opts.month ?? "long",
    day: opts.day ?? "numeric",
    year: opts.year ?? "numeric",
    ...opts,
  }).format(new Date(date))
}

/**
 * Stole this from the @radix-ui/primitive
 * @see https://github.com/radix-ui/primitives/blob/main/packages/core/primitive/src/primitive.tsx
 */
export function composeEventHandlers<E>(
  originalEventHandler?: (event: E) => void,
  ourEventHandler?: (event: E) => void,
  { checkForDefaultPrevented = true } = {}
) {
  return function handleEvent(event: E) {
    originalEventHandler?.(event)

    if (
      checkForDefaultPrevented === false ||
      !(event as unknown as Event).defaultPrevented
    ) {
      return ourEventHandler?.(event)
    }
  }
}

export function toTitleCase(str: string = "") {
  const withSpaces = str.replace(/([A-Z])/g, " $1").toLowerCase()
  return withSpaces
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .trim()
}

// util to format number to comma separated string
export function formatNumber(num: number): string {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
}

// Function to check if a string is a UUID
export function isUUID(str: string) {
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  return uuidRegex.test(str)
}

// Helper function to check if content is empty or null
export function isEmptyContent(content: string | null | undefined): boolean {
  return content === null || content === undefined || content.trim() === ""
}

/**
 * Check if two message contents are similar
 * This is used to detect potential duplicates
 */
export function areSimilarMessages(msg1: Message, msg2: Message): boolean {
  const msg1Images = msg1.images ?? []
  const msg2Images = msg2.images ?? []

  if (msg1Images.length > 0 || msg2Images.length > 0) {
    if (msg1Images.length !== msg2Images.length) return false

    return msg1Images.every((image, index) => {
      const other = msg2Images[index]
      if (!other) return false
      return image.id === other.id || image.url === other.url
    })
  }

  // If content is exactly the same, they're similar
  if (msg1.content === msg2.content) return true

  // If either content is null, they're not similar
  if (!msg1.content || !msg2.content) return false

  // For better matching, normalize the text by removing whitespace and making lowercase
  const normalizeContent = (content: string) =>
    content.trim().toLowerCase().replace(/\s+/g, " ")

  const normalized1 = normalizeContent(msg1.content)
  const normalized2 = normalizeContent(msg2.content)

  // If normalized content is the same, they're similar
  if (normalized1 === normalized2) return true

  // If the messages are very close in content (e.g. small typo fixes)
  // we can use a similarity score like Levenshtein distance
  // For simplicity, we'll check if one is a substring of the other
  // or if they're very close in length
  return (
    normalized1.includes(normalized2) ||
    normalized2.includes(normalized1) ||
    Math.abs(normalized1.length - normalized2.length) < 3
  )
}

/**
 * Deduplicate messages by comparing content and role
 */
export function deduplicateMessages(
  messages: Message[],
  tempMessages: Message[]
): Message[] {
  if (tempMessages.length === 0) return messages

  // For each temp message, check if we have a similar message in the database messages
  const remainingTempMessages = tempMessages.filter((tempMsg) => {
    // Find any database message that matches our temporary message
    const matchingDbMessage = messages.find(
      (dbMsg) =>
        dbMsg.role === tempMsg.role && areSimilarMessages(dbMsg, tempMsg)
    )

    // Keep only temp messages that DON'T have a match in the database
    return !matchingDbMessage
  })

  return remainingTempMessages
}

/**
 * Filter messages to only include user and assistant roles
 */
export function filterMessagesByRole(messages: Message[]): Message[] {
  return messages.filter((message) => isDisplayRole(message.role))
}

// Helper function to convert snake_case to Title Case
export function formatToolName(name: string | null | undefined): string {
  if (!name) return ""

  // Split by underscore or hyphen
  return name
    .split(/[_-]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ")
}
