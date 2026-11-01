import { timingSafeEqual } from "node:crypto"
import { z } from "zod"

import { getAppMode } from "@/lib/appMode"

const localHosts = new Set([
  "localhost",
  "127.0.0.1",
  "[::1]",
  "host.docker.internal",
])

export function isLocalUrl(value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "http:" &&
      localHosts.has(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function checkLocalRequest(request: Request, bearer = false) {
  if (getAppMode() === "observe") {
    return Response.json({ error: "OBSERVE_MODE_READ_ONLY" }, { status: 403 })
  }
  const url = new URL(request.url)
  const host = request.headers.get("host")
  if (
    !isLocalUrl(request.url) ||
    (host && !isLocalUrl(`http://${host}`)) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  ) {
    return Response.json({ error: "Local requests only" }, { status: 403 })
  }
  if (bearer) {
    const token = process.env.MOCK_WHATSAPP_TOKEN
    if (!token) {
      return Response.json(
        { error: "MOCK_WHATSAPP_TOKEN is required" },
        { status: 503 }
      )
    }
    const supplied = Buffer.from(request.headers.get("authorization") ?? "")
    const expected = Buffer.from(`Bearer ${token}`)
    if (
      supplied.length !== expected.length ||
      !timingSafeEqual(supplied, expected)
    ) {
      return Response.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (
    request.method !== "GET" &&
    request.headers.get("origin") !== (host ? `http://${host}` : url.origin)
  ) {
    return Response.json(
      { error: "Same-origin requests only" },
      { status: 403 }
    )
  }
  return null
}

export const textPayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    to: z.string().regex(/^\d+$/),
    type: z.literal("text"),
    text: z
      .object({
        body: z
          .string()
          .refine(
            (body) => body.trim().length > 0 && Array.from(body).length <= 4096
          ),
      })
      .passthrough(),
  })
  .passthrough()

export const readPayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    status: z.literal("read"),
    message_id: z.string().min(1),
    typing_indicator: z.object({ type: z.literal("text") }).optional(),
  })
  .passthrough()

export const faultSchema = z.object({
  target: z.enum(["text", "action"]),
  recipientId: z.string().optional(),
  skip: z.number().int().min(0).default(0),
  status: z.union([z.literal(429), z.literal(500)]).optional(),
  delayMs: z.number().int().min(0).max(30000).default(0),
})

type Fault = z.infer<typeof faultSchema>
const state = globalThis as typeof globalThis & { whatsappFault?: Fault | null }

export function setFault(fault: Fault | null) {
  state.whatsappFault = fault
}

export function takeFault(target: Fault["target"], recipientId: string) {
  const fault = state.whatsappFault
  if (
    !fault ||
    fault.target !== target ||
    (fault.recipientId && fault.recipientId !== recipientId)
  ) {
    return null
  }
  if (fault.skip > 0) {
    fault.skip -= 1
    return null
  }
  state.whatsappFault = null
  return fault
}
