import { getMessages } from "@/lib/messages"

export const dynamic = "force-dynamic"

export async function GET() {
  const response = await getMessages()

  if (response.error) {
    const status = response.error === "DATABASE_CONNECTION_ERROR" ? 503 : 500
    return Response.json(response, { status })
  }

  return Response.json(response)
}
