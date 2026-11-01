import { readEvents } from "@/lib/localEvents"
import { DEFAULT_RECIPIENT_ID } from "@/lib/metaWebhook"
import { checkLocalRequest } from "@/lib/mockTransport"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const denied = checkLocalRequest(request)
  if (denied) return denied
  const params = new URL(request.url).searchParams
  const after = Number(params.get("after") ?? 0)
  const recipientId = params.get("recipientId") ?? DEFAULT_RECIPIENT_ID
  if (!Number.isSafeInteger(after) || after < 0 || !/^\d+$/.test(recipientId)) {
    return Response.json(
      { error: "Invalid event cursor or recipient" },
      { status: 400 }
    )
  }
  try {
    const events = await readEvents()
    return Response.json(
      {
        events: events.filter(
          (event) => event.seq > after && event.recipientId === recipientId
        ),
        nextCursor: events.at(-1)?.seq ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch {
    return Response.json(
      { error: "Could not read local WhatsApp events" },
      { status: 503 }
    )
  }
}
