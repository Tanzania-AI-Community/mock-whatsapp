export type AppMode = "chat" | "observe"

export function getAppMode(appMode = process.env.APP_MODE): AppMode {
  return appMode === "observe" ? "observe" : "chat"
}

export function parseObservedUserId(rawUserId: string | string[] | undefined): {
  userId: number | null
  error?: string
} {
  const value = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId

  if (!value) {
    return { userId: null }
  }

  if (!/^\d+$/.test(value)) {
    return {
      userId: null,
      error: "Enter a positive numeric user ID.",
    }
  }

  const userId = Number(value)

  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return {
      userId: null,
      error: "Enter a positive numeric user ID.",
    }
  }

  return { userId }
}
