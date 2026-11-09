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

const chars = (value: string) => Array.from(value).length
const text = (max: number) =>
  z.string().refine((value) => value.trim().length > 0 && chars(value) <= max, {
    message: `Must contain 1-${max} characters`,
  })
const recipient = z.string().regex(/^\d+$/)
const mediaId = z.string().regex(/^\d+$/, "Use an uploaded media ID")
const unique = (values: string[]) => new Set(values).size === values.length

export const textPayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    to: recipient,
    type: z.literal("text"),
    text: z.object({ body: text(4096) }).passthrough(),
  })
  .passthrough()

// Twiga sends media by uploaded ID; links would make the mock fetch remote files
export const imagePayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    to: recipient,
    type: z.literal("image"),
    image: z.strictObject({ id: mediaId, caption: text(1024).optional() }),
  })
  .passthrough()

export const documentPayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    to: recipient,
    type: z.literal("document"),
    document: z.strictObject({
      id: mediaId,
      caption: text(1024).optional(),
      filename: z
        .string()
        .regex(/^[^/\\]+\.[A-Za-z0-9]+$/, "Filename needs an extension")
        .optional(),
    }),
  })
  .passthrough()

const textHeader = z.object({ type: z.literal("text"), text: text(60) })
const footer = z.object({ text: text(60) })

// Limits from Meta's interactive reply button and list message references
const buttonSchema = z.object({
  type: z.literal("button"),
  header: textHeader.optional(),
  body: z.object({ text: text(1024) }),
  footer: footer.optional(),
  action: z.object({
    buttons: z
      .array(
        z.object({
          type: z.literal("reply"),
          reply: z.object({ id: text(256), title: text(20) }),
        })
      )
      .min(1)
      .max(3)
      .refine((buttons) => unique(buttons.map((b) => b.reply.id)), {
        message: "Button IDs must be unique",
      })
      .refine((buttons) => unique(buttons.map((b) => b.reply.title)), {
        message: "Button titles must be unique",
      }),
  }),
})

const listSchema = z.object({
  type: z.literal("list"),
  header: textHeader.optional(),
  body: z.object({ text: text(4096) }),
  footer: footer.optional(),
  action: z.object({
    button: text(20),
    sections: z
      .array(
        z.object({
          title: text(24),
          rows: z
            .array(
              z.object({
                id: text(200),
                title: text(24),
                description: text(72)
                  .nullish()
                  .transform((value) => value ?? undefined),
              })
            )
            .min(1),
        })
      )
      .min(1)
      .max(10)
      .refine(
        (sections) => sections.flatMap((section) => section.rows).length <= 10,
        { message: "Lists support at most 10 rows" }
      )
      .refine(
        (sections) =>
          unique(sections.flatMap((section) => section.rows.map((r) => r.id))),
        { message: "Row IDs must be unique" }
      ),
  }),
})

const flowSchema = z.object({
  type: z.literal("flow"),
  header: textHeader.optional(),
  body: z.object({ text: z.string().min(1) }),
  footer: z.object({ text: z.string() }).optional(),
  action: z.object({
    name: z.literal("flow"),
    parameters: z
      .object({
        flow_message_version: z.literal("3"),
        flow_token: z.string().min(1),
        flow_id: z.string().min(1).optional(),
        flow_name: z.string().min(1).optional(),
        flow_cta: z.string().min(1),
        flow_action: z.enum(["navigate", "data_exchange"]).optional(),
        mode: z.enum(["draft", "published"]).optional(),
        flow_action_payload: z
          .object({
            screen: z.string().min(1),
            data: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
      })
      .refine((p) => !p.flow_id !== !p.flow_name, {
        message: "Use exactly one of flow_id or flow_name",
      })
      .refine(
        (p) => p.flow_action === "data_exchange" || !!p.flow_action_payload,
        { message: "Navigate flows need flow_action_payload" }
      ),
  }),
})

export const interactivePayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    to: recipient,
    type: z.literal("interactive"),
    interactive: z.discriminatedUnion("type", [
      buttonSchema,
      listSchema,
      flowSchema,
    ]),
  })
  .passthrough()

export const outgoingSchemas = {
  text: textPayloadSchema,
  image: imagePayloadSchema,
  document: documentPayloadSchema,
  interactive: interactivePayloadSchema,
} as const

export const readPayloadSchema = z
  .object({
    messaging_product: z.literal("whatsapp"),
    status: z.literal("read"),
    message_id: z.string().min(1),
    typing_indicator: z.object({ type: z.literal("text") }).optional(),
  })
  .passthrough()

const errorTitles: Record<number, string> = {
  100: "Invalid parameter",
  131008: "Required parameter is missing",
  131009: "Parameter value is not valid",
  131053: "Media upload error",
  131052: "Media download error",
  131000: "Something went wrong",
}

// Same envelope as Graph API errors
export function whatsappError(status: number, code: number, details: string) {
  return Response.json(
    {
      error: {
        message: `(#${code}) ${errorTitles[code] ?? "Error"}`,
        type: "OAuthException",
        code,
        error_data: { messaging_product: "whatsapp", details },
        fbtrace_id: `mock.${crypto.randomUUID()}`,
      },
    },
    { status }
  )
}

export function issueDetails(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
    .join("; ")
}

export const faultTargets = [
  "text",
  "action",
  "image",
  "document",
  "interactive",
  "upload",
  "delete",
  "download",
] as const

export const faultSchema = z.object({
  target: z.enum(faultTargets),
  recipientId: z.string().optional(),
  skip: z.number().int().min(0).default(0),
  status: z
    .union([
      z.literal(400),
      z.literal(404),
      z.literal(413),
      z.literal(429),
      z.literal(500),
    ])
    .optional(),
  delayMs: z.number().int().min(0).max(30000).default(0),
})

type Fault = z.infer<typeof faultSchema>
const state = globalThis as typeof globalThis & { whatsappFault?: Fault | null }

export function setFault(fault: Fault | null) {
  state.whatsappFault = fault
}

export function takeFault(target: Fault["target"], recipientId?: string) {
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

// Applies a configured delay and returns the simulated rejection, if any
export async function applyFault(
  target: Fault["target"],
  recipientId?: string
) {
  const fault = takeFault(target, recipientId)
  if (fault?.delayMs)
    await new Promise((resolve) => setTimeout(resolve, fault.delayMs))
  if (!fault?.status) return null
  return {
    status: fault.status,
    error: `Simulated WhatsApp ${target} rejection (${fault.status})`,
  }
}
