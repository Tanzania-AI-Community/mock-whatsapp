import { z } from "zod"

import { checkLocalRequest, faultSchema, setFault } from "@/lib/mockTransport"

export const runtime = "nodejs"

export async function PUT(request: Request) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied
  const parsed = z
    .object({ rule: faultSchema.nullable() })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success)
    return Response.json({ error: "Invalid failure rule" }, { status: 400 })
  setFault(parsed.data.rule)
  return Response.json({ success: true })
}
