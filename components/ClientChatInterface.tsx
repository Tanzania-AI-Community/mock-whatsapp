"use client"

import { useEffect, useRef, useState } from "react"
import { mockMessages } from "@/data/mockMessages"
import { Loader2, MoreVertical, RefreshCw } from "lucide-react"

import type { Message } from "@/types/chat"
import { deduplicateMessages } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChatContainer } from "@/components/ChatContainer"
import { ChatInput } from "@/components/ChatInput"
import { getMessages } from "@/app/actions/messages"
import { sendWhatsAppMessage } from "@/app/actions/whatsapp"

interface ClientChatInterfaceProps {
  initialMessages: Message[]
  isInitialLoading?: boolean
}

export default function ClientChatInterface({
  initialMessages,
  isInitialLoading = false,
}: ClientChatInterfaceProps) {
  // Use initialMessages as the starting point for our state
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [isLoading, setIsLoading] = useState(isInitialLoading)
  const [useDB, setUseDB] = useState(true)
  const [dbError, setDbError] = useState<string | null>(null)
  const [tempMessages, setTempMessages] = useState<Message[]>([])
  const [sendingMessage, setSendingMessage] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const messageContentRef = useRef<string | null>(null)
  const isFirstRenderRef = useRef(true)

  // Fetch messages using the server action
  const fetchMessages = async () => {
    try {
      if (!useDB) {
        setMessages(mockMessages)
        setIsLoading(false)
        setDbError(null)
        return
      }

      // Skip fetching on first render since we already have initialMessages
      if (isFirstRenderRef.current && initialMessages.length > 0) {
        isFirstRenderRef.current = false
        setIsLoading(false)
        return
      }

      const data = await getMessages()

      // Check if we have any temp messages that match ones in the database
      if (tempMessages.length > 0) {
        const remainingTempMessages = deduplicateMessages(data, tempMessages)
        setTempMessages(remainingTempMessages)

        // If the message we just sent is now in the database, stop sending state
        if (messageContentRef.current) {
          const sentMessageExists = data.some(
            (dbMsg) =>
              dbMsg.role === "user" &&
              dbMsg.content === messageContentRef.current
          )

          if (sentMessageExists) {
            setSendingMessage(false)
            messageContentRef.current = null
          }
        }
      }

      setMessages(data)

      if (data.length > 0 && data[0].id === mockMessages[0].id) {
        setDbError("Database connection failed, using mock data")
        setUseDB(false)
      } else {
        setDbError(null)
      }

      setIsLoading(false)
    } catch (error) {
      console.error("Error fetching messages:", error)
      setUseDB(false)
      setMessages(mockMessages)
      setDbError(`${error}`)
      setIsLoading(false)
    }
  }

  // Set up polling
  useEffect(() => {
    // Only start polling after the first render
    if (!isFirstRenderRef.current) {
      fetchMessages()
    } else {
      isFirstRenderRef.current = false
    }

    const interval = sendingMessage ? 1000 : 2000

    pollingIntervalRef.current = setInterval(() => {
      fetchMessages()
    }, interval)

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [useDB, sendingMessage])

  const handleRefresh = () => {
    setIsLoading(true)
    fetchMessages()
  }

  const handleClearChat = () => {
    setMessages([])
    setTempMessages([])
    messageContentRef.current = null
  }

  const handleToggleDataSource = () => {
    setUseDB(!useDB)
  }

  const handleSendMessage = async (text: string) => {
    if (sendingMessage) return

    messageContentRef.current = text

    const tempMessage: Message = {
      id: Date.now(),
      role: "user",
      content: text,
      created_at: new Date(),
      timestamp: Math.floor(Date.now() / 1000),
      status: "sending",
      isTemp: true,
    }

    setTempMessages((prev) => [...prev, tempMessage])
    setSendingMessage(true)

    try {
      const result = await sendWhatsAppMessage({ body: text })

      if (!result.success) {
        throw new Error("Failed to send message to WhatsApp API")
      }

      await fetchMessages()

      setTempMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, status: "sent" } : msg
        )
      )

      setTimeout(() => {
        setTempMessages((prev) =>
          prev.filter((msg) => msg.id !== tempMessage.id)
        )
        if (messageContentRef.current === text) {
          messageContentRef.current = null
        }
        setSendingMessage(false)
      }, 10000)
    } catch (error) {
      console.error("Error sending message:", error)

      setTempMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempMessage.id ? { ...msg, status: "error" } : msg
        )
      )

      setTimeout(() => {
        setTempMessages((prev) =>
          prev.filter((msg) => msg.id !== tempMessage.id)
        )
        if (messageContentRef.current === text) {
          messageContentRef.current = null
        }
        setSendingMessage(false)
      }, 5000)
    }
  }

  // Filter to only show user and assistant messages
  const filterAllowedRoles = (msgs: Message[]): Message[] => {
    return msgs.filter((msg) => msg.role === "user" || msg.role === "assistant")
  }

  // Combine real and temporary messages for display, filtering out unwanted roles
  const filteredMessages =
    messages.length > 0 ? filterAllowedRoles(messages) : []
  const filteredTempMessages =
    tempMessages.length > 0 ? filterAllowedRoles(tempMessages) : []
  const combinedMessages = [...filteredMessages, ...filteredTempMessages]

  return (
    <div className="mx-auto flex h-screen min-w-[350px] max-w-2xl flex-col rounded-lg bg-primary-foreground shadow-lg">
      {/* Header section */}
      <div className="flex items-center justify-between bg-primary px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <span className="text-lg font-semibold text-primary">T</span>
          </div>
          <h1 className="text-xl font-semibold text-primary-foreground">
            Twiga
          </h1>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="text-primary-foreground">
              <MoreVertical className="size-6" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleRefresh}>
              <RefreshCw className="mr-2 size-4" />
              Refresh
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleClearChat}>
              Clear chat
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleToggleDataSource}>
              {useDB ? "Use Mock Data" : "Use Database"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Chat area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLoading && combinedMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-6 animate-spin" />
            Loading messages...
          </div>
        ) : (
          <>
            <ChatContainer messages={combinedMessages} />
            {(!useDB || dbError) && (
              <div className="absolute bottom-4 left-4 rounded bg-yellow-100 px-3 py-1 text-xs text-yellow-800">
                {dbError || "Using mock data"}
              </div>
            )}
          </>
        )}
      </div>

      {/* Input area */}
      <div className="p-4">
        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={sendingMessage}
        />
      </div>
    </div>
  )
}
