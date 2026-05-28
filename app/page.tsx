import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import { getAppMode, parseObservedUserId } from "@/lib/appMode"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import ClientChatInterface from "@/components/ClientChatInterface"

import { getMessages } from "./actions/messages"

interface HomeProps {
  searchParams?: Promise<{
    userId?: string | string[]
  }>
}

function ObserveUserLookup({
  error,
  userIdValue,
}: {
  error?: string
  userIdValue?: string
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl bg-primary-foreground p-8 shadow-lg">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-primary">
            Observe Mode
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            Load a user conversation
          </h1>
          <p className="text-sm text-muted-foreground">
            This mode only reads messages from the database and never sends
            WhatsApp messages.
          </p>
        </div>

        <form method="get" className="mt-6 space-y-4">
          <Input
            name="userId"
            inputMode="numeric"
            placeholder="Enter a user ID"
            defaultValue={userIdValue}
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full">
            View Conversation
          </Button>
        </form>
      </div>
    </div>
  )
}

export default async function Home({ searchParams }: HomeProps) {
  const appMode = getAppMode()
  const params = searchParams ? await searchParams : undefined
  const rawObservedUserId = params?.userId
  const observedUserIdResult =
    appMode === "observe"
      ? parseObservedUserId(rawObservedUserId)
      : { userId: null as number | null }
  const observedUserId = observedUserIdResult.userId
  const hasRequestedObservedUserId =
    typeof rawObservedUserId === "string"
      ? rawObservedUserId.trim().length > 0
      : Array.isArray(rawObservedUserId)
        ? rawObservedUserId.some((value) => value.trim().length > 0)
        : false
  const shouldFetchMessages = appMode === "chat" || observedUserId !== null

  const response = shouldFetchMessages
    ? await getMessages(
        appMode === "observe" ? { userId: observedUserId ?? undefined } : {}
      )
    : { messages: [], error: undefined }
  const { messages = [], error } = response

  if (appMode === "observe" && observedUserId === null) {
    return (
      <ObserveUserLookup
        error={
          hasRequestedObservedUserId ? observedUserIdResult.error : undefined
        }
        userIdValue={
          typeof rawObservedUserId === "string" ? rawObservedUserId : undefined
        }
      />
    )
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
      // TODO Add a skeleton loader here
    >
      <ClientChatInterface
        initialMessages={messages}
        isInitialLoading={!!error}
        mode={appMode}
        observedUserId={observedUserId}
      />
    </Suspense>
  )
}
