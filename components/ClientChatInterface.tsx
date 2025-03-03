"use client"

import { useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Database,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
} from "lucide-react"

import type { Message } from "@/types/chat"
import { shouldTriggerScroll } from "@/lib/messageUtils"
import { deduplicateMessages } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  const [dbError, setDbError] = useState<string | null>(null)
  const [connectionFailed, setConnectionFailed] = useState(false)
  const [tempMessages, setTempMessages] = useState<Message[]>([])
  const [sendingMessage, setSendingMessage] = useState(false)
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true)
  const [isPollingSuspended, setIsPollingSuspended] = useState(false)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const messageContentRef = useRef<string | null>(null)
  const prevMessagesLengthRef = useRef(initialMessages.length)
  const [userJustSentMessage, setUserJustSentMessage] = useState(false)
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true) // Add this state

  // Fetch messages using the server action
  const fetchMessages = async () => {
    if (isPollingSuspended) return

    try {
      setIsLoading(true)
      const response = await getMessages()
      setIsLoading(false)

      if (response.error) {
        handleDatabaseError(response.error)
        return
      }

      if (response.messages) {
        handleNewMessages(response.messages)
      }
    } catch (error) {
      console.error("Error in fetchMessages:", error)
      setDbError("Failed to fetch messages. Please try again.")
      setIsLoading(false)
    }
  }

  // Helper function to handle database errors
  const handleDatabaseError = (error: string) => {
    const isConnectionError = error === "DATABASE_CONNECTION_ERROR"
    setConnectionFailed(isConnectionError)
    setDbError(
      isConnectionError
        ? "Database connection failed. Please check your database configuration."
        : "An error occurred while fetching messages."
    )
    if (isConnectionError) {
      setIsPollingSuspended(true)
    }
  }

  // Helper function to handle new messages
  const handleNewMessages = (newMessages: Message[]) => {
    if (tempMessages.length > 0) {
      handleTempMessages(newMessages)
    }

    const shouldScroll = shouldTriggerScroll(
      newMessages,
      prevMessagesLengthRef.current,
      userJustSentMessage,
      isAutoScrollEnabled // Pass the state here
    )

    if (shouldScroll) {
      setShouldScrollToBottom(true)
      setUserJustSentMessage(false)
    }

    prevMessagesLengthRef.current = newMessages.length
    setMessages(newMessages)
    setDbError(null)
    setConnectionFailed(false)
  }

  // Helper function to handle temporary messages
  const handleTempMessages = (newMessages: Message[]) => {
    const remainingTempMessages = deduplicateMessages(newMessages, tempMessages)
    setTempMessages(remainingTempMessages)

    if (messageContentRef.current) {
      const sentMessageExists = newMessages.some(
        (dbMsg) =>
          dbMsg.role === "user" && dbMsg.content === messageContentRef.current
      )

      if (sentMessageExists) {
        setSendingMessage(false)
        messageContentRef.current = null
      }
    }
  }

  // Set up polling
  useEffect(() => {
    // Initial fetch on mount
    fetchMessages()

    // Only set up polling if not suspended
    if (!isPollingSuspended) {
      const interval = sendingMessage ? 1000 : 2000

      pollingIntervalRef.current = setInterval(() => {
        fetchMessages()
      }, interval)

      return () => {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current)
        }
      }
    } else {
      // Clean up any existing interval when suspended
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [sendingMessage, isPollingSuspended])

  // When initial messages are updated from props
  useEffect(() => {
    if (initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages)
      prevMessagesLengthRef.current = initialMessages.length
      setShouldScrollToBottom(true)
    }
  }, [initialMessages, messages.length])

  const handleRefresh = () => {
    // Re-enable polling if it was suspended
    setIsPollingSuspended(false)
    setConnectionFailed(false)
    setShouldScrollToBottom(true)
    fetchMessages()
  }

  const handleClearChat = () => {
    setMessages([])
    setTempMessages([])
    messageContentRef.current = null
  }

  const handleSendMessage = async (text: string) => {
    // If we have a connection error, prevent sending
    if (connectionFailed) {
      // Show a temporary error that sending is disabled
      setDbError(
        "Cannot send messages while disconnected from the database. Please restore connection and refresh."
      )
      setTimeout(() => {
        setDbError(
          "Database connection failed. Please check your database configuration."
        )
      }, 3000)
      return
    }

    if (sendingMessage) return

    messageContentRef.current = text

    // Set flag that user just sent a message to ensure scroll
    setUserJustSentMessage(true)

    // Always scroll to bottom when sending a new message
    setShouldScrollToBottom(true)

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

  const handleScrollComplete = () => {
    // Reset the scroll flag after scrolling is complete
    setShouldScrollToBottom(false)
  }

  // Add handler for scroll state changes
  const handleScrollStateChange = (isAtBottom: boolean) => {
    setIsAutoScrollEnabled(isAtBottom)
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
    <div className="mx-auto flex h-screen min-w-[500px] max-w-2xl flex-col rounded-lg bg-primary-foreground shadow-lg">
      {/* Header section */}
      <div className="flex items-center justify-between bg-primary px-4 py-3">
        <div className="flex items-center space-x-3">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <span className="text-lg font-semibold text-primary">T</span>
          </div>
          <h1 className="text-xl font-semibold text-primary-foreground">
            Twiga
          </h1>
          {/* Database status indicator */}
          {connectionFailed ? (
            <div className="flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
              <Database className="mr-1 size-3" /> Disconnected
            </div>
          ) : (
            <div className="flex items-center rounded-full bg-green-500 px-2 py-0.5 text-xs text-white">
              <Database className="mr-1 size-3" /> Connected
            </div>
          )}
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Database error notification */}
      {connectionFailed && (
        <div className="flex items-center justify-between gap-4 bg-red-50 px-6 py-3 text-sm text-red-800">
          <div className="flex items-center">
            <AlertCircle className="mr-2 size-5 text-red-600" />
            <div>
              <p className="font-medium">Database Connection Error</p>
              <p className="text-xs">
                Please check your database configuration and ensure PostgreSQL
                is running.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            onClick={handleRefresh}
            className="whitespace-nowrap"
          >
            <RefreshCw className="mr-2 size-4" />
            Retry Connection
          </Button>
        </div>
      )}

      {/* Chat area */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLoading && combinedMessages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 size-6 animate-spin" />
            Loading messages...
          </div>
        ) : combinedMessages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
            <MessageSquare className="mb-4 size-12 opacity-20" />
            <h3 className="mb-1 text-lg font-medium">No messages yet</h3>
            <p className="text-center text-sm">
              Start a conversation by sending a message below
            </p>
          </div>
        ) : (
          <>
            <ChatContainer
              messages={combinedMessages}
              shouldScrollToBottom={shouldScrollToBottom}
              onScrollComplete={handleScrollComplete}
              onScrollStateChange={handleScrollStateChange} // Add this prop
            />
            {dbError && !connectionFailed && (
              <div className="absolute bottom-4 left-4 rounded bg-red-100 px-3 py-1 text-xs text-red-800">
                {dbError}
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
          disabled={connectionFailed}
          placeholder={
            connectionFailed
              ? "Database connection required to send messages"
              : "Type a message..."
          }
        />
      </div>
    </div>
  )
}
