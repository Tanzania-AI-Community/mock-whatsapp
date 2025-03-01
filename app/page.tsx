import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import ClientChatInterface from "@/components/ClientChatInterface"

import { getMessages } from "./actions/messages"

// Make this an async function so we can fetch data server-side
export default async function Home() {
  // Prefetch messages server-side
  let messages: any = []
  let isError = false

  try {
    messages = await getMessages()
  } catch (error) {
    console.error("Error pre-fetching messages:", error)
    isError = true
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="size-8 animate-spin text-primary" />
        </div>
      }
    >
      {/* 
        Pass the pre-fetched messages to the client component.
        The client component will handle all the interaction and real-time updates.
      */}
      <ClientChatInterface
        initialMessages={messages}
        isInitialLoading={isError || messages.length === 0}
      />
    </Suspense>
  )
}
