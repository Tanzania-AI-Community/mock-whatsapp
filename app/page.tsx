import { Suspense } from "react"
import { Loader2 } from "lucide-react"

import ClientChatInterface from "@/components/ClientChatInterface"

import { getMessages } from "./actions/messages"

export default async function Home() {
  // Prefetch messages server-side
  const response = await getMessages()
  const { messages = [], error } = response

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
      />
    </Suspense>
  )
}
