import { appendEvent } from "@/lib/localEvents"
import {
  MAX_MEDIA_BYTES,
  MediaError,
  outgoingTypes,
  saveMedia,
} from "@/lib/mediaStore"
import {
  applyFault,
  checkLocalRequest,
  whatsappError,
} from "@/lib/mockTransport"

export const runtime = "nodejs"

// Uploads have no recipient yet, so their failures are logged globally
async function reject(status: number, code: number, details: string) {
  await appendEvent({
    kind: "rejected",
    recipientId: "",
    status,
    error: details,
  })
  return whatsappError(status, code, details)
}

export async function POST(request: Request) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied

  const length = Number(request.headers.get("content-length"))
  if (!length) return reject(411, 131008, "Content-Length is required")
  // Rejects oversized bodies before they are read
  if (length > MAX_MEDIA_BYTES + 64 * 1024)
    return reject(413, 131053, "Media exceeds the 100 MB upload limit")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return reject(400, 100, "Expected a multipart/form-data upload")
  }
  const file = form.get("file")
  if (form.get("messaging_product") !== "whatsapp")
    return reject(400, 131008, "messaging_product must be whatsapp")
  if (!(file instanceof File))
    return reject(400, 131008, "The file field is required")

  const fault = await applyFault("upload")
  if (fault) return reject(fault.status, 131053, fault.error)

  try {
    const media = await saveMedia(file, {
      direction: "outgoing",
      allowed: outgoingTypes,
      filename: file.name,
    })
    return Response.json({ id: media.id })
  } catch (error) {
    if (error instanceof MediaError)
      return reject(error.status, 131053, error.message)
    return Response.json(
      { error: "Could not store uploaded media" },
      { status: 503 }
    )
  }
}
