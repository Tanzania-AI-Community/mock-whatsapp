import { env } from "@/env.js"
import { z } from "zod"

import { decryptFlowResponse, encryptFlowRequest } from "@/lib/flowCrypto"
import { findSentFlow, readFlowPublicKey } from "@/lib/flows"
import { forwardInbound } from "@/lib/inbound"
import { BUSINESS_PHONE_NUMBER } from "@/lib/metaWebhook"
import { checkLocalRequest, isLocalUrl } from "@/lib/mockTransport"

export const runtime = "nodejs"

const inputSchema = z.object({
  messageId: z.string().min(1),
  action: z.enum(["data_exchange", "BACK"]),
  screen: z.string().min(1),
  data: z.record(z.string(), z.unknown()).default({}),
})

const responseSchema = z.object({
  screen: z.string(),
  data: z.record(z.string(), z.unknown()).default({}),
})

const failed = (error: string, status = 502) =>
  Response.json({ error }, { status })

// Sends one Flow screen action to Twiga's /flows endpoint, as the WhatsApp client would
export async function POST(request: Request) {
  const denied = checkLocalRequest(request)
  if (denied) return denied
  const input = inputSchema.safeParse(await request.json().catch(() => null))
  if (!input.success) return failed("Invalid flow action", 400)
  const flow = await findSentFlow(input.data.messageId)
  if (!flow) return failed("Unknown flow message", 404)
  if (!env.CHATBOT_CALLBACK_URL || !isLocalUrl(env.CHATBOT_CALLBACK_URL))
    return failed("CHATBOT_CALLBACK_URL must be a local HTTP URL", 503)

  let publicKey: string
  try {
    publicKey = await readFlowPublicKey()
  } catch (error) {
    return failed((error as Error).message, 503)
  }
  const { body, aesKey, iv } = encryptFlowRequest(
    {
      version: "3.0",
      action: input.data.action,
      screen: input.data.screen,
      data: input.data.data,
      flow_token: flow.parameters.flow_token,
    },
    publicKey
  )
  let text: string
  try {
    const response = await fetch(new URL("/flows", env.CHATBOT_CALLBACK_URL), {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    text = await response.text()
    if (!response.ok)
      return failed(`Twiga flow endpoint returned ${response.status}: ${text}`)
  } catch {
    return failed("Could not reach the Twiga flow endpoint")
  }

  let next: z.infer<typeof responseSchema>
  try {
    next = responseSchema.parse(decryptFlowResponse(text, aesKey, iv))
  } catch {
    return failed("Twiga returned an unreadable flow response")
  }
  if (next.screen !== "SUCCESS") return Response.json(next)

  // Completing the Flow sends the user's response message, like WhatsApp does
  const params = z
    .object({
      extension_message_response: z.object({
        params: z.record(z.string(), z.unknown()),
      }),
    })
    .safeParse(next.data)
  if (!params.success) return failed("SUCCESS response is missing params")
  const response = params.data.extension_message_response.params
  const forwarded = await forwardInbound(
    {
      recipientId: flow.recipientId,
      messageId: `wamid.${crypto.randomUUID()}`,
      body: "Sent",
      contextId: flow.messageId,
      reply: { type: "nfm_reply", response },
    },
    {
      type: "interactive",
      context: { from: BUSINESS_PHONE_NUMBER, id: flow.messageId },
      interactive: {
        type: "nfm_reply",
        nfm_reply: {
          name: "flow",
          body: "Sent",
          response_json: JSON.stringify(response),
        },
      },
    }
  )
  const result = await forwarded.json()
  return Response.json(
    { screen: "SUCCESS", ...result },
    { status: forwarded.status }
  )
}
