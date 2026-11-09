import { findSentFlow, readFlowDefinition } from "@/lib/flows"
import { checkLocalRequest } from "@/lib/mockTransport"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const denied = checkLocalRequest(request)
  if (denied) return denied
  const messageId = new URL(request.url).searchParams.get("messageId") ?? ""
  const flow = await findSentFlow(messageId)
  if (!flow)
    return Response.json({ error: "Unknown flow message" }, { status: 404 })
  try {
    const payload = flow.parameters.flow_action_payload
    return Response.json({
      definition: await readFlowDefinition(payload?.screen),
      screen: payload?.screen,
      data: payload?.data ?? {},
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 503 })
  }
}
