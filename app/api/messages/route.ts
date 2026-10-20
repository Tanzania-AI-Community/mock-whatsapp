import { getAppMode, parseObservedUserId } from "@/lib/appMode"
import { getMessages } from "@/lib/messages"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  let userId: number | undefined
  if (getAppMode() === "observe") {
    const parsed = parseObservedUserId(
      new URL(request.url).searchParams.get("userId") ?? undefined
    )
    if (parsed.userId === null) {
      return Response.json(
        { messages: [], error: parsed.error ?? "A user ID is required." },
        { status: 400 }
      )
    }
    userId = parsed.userId
  }
  const response = await getMessages({ userId })

  if (response.error) {
    const status = response.error === "DATABASE_CONNECTION_ERROR" ? 503 : 500
    return Response.json(response, { status })
  }

  return Response.json(response)
}
