import { appendEvent } from "@/lib/localEvents"
import { MediaError, readMedia, updateMedia } from "@/lib/mediaStore"
import {
  applyFault,
  checkLocalRequest,
  whatsappError,
} from "@/lib/mockTransport"

export const runtime = "nodejs"

type Context = { params: Promise<{ mediaId: string }> }

// GET /{media-id}: metadata with a local download URL
export async function GET(request: Request, { params }: Context) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied
  const { mediaId } = await params
  const media = await readMedia(mediaId)
  if (!media || media.deletedAt)
    return whatsappError(404, 100, `Media ID ${mediaId} was not found`)
  const fault = await applyFault("download")
  if (fault) return whatsappError(fault.status, 131052, fault.error)
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  return Response.json({
    messaging_product: "whatsapp",
    url: `${url.protocol}//${host}/api/whatsapp/media/${media.id}`,
    mime_type: media.mimeType,
    sha256: media.sha256,
    file_size: media.size,
    id: media.id,
  })
}

// DELETE /{media-id}: removes the server copy; delivered messages keep theirs
export async function DELETE(request: Request, { params }: Context) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied
  const { mediaId } = await params
  const media = await readMedia(mediaId)
  if (!media || media.deletedAt)
    return whatsappError(404, 100, `Media ID ${mediaId} was not found`)
  const recipientId = media.deliveredTo ?? ""
  const fault = await applyFault("delete", recipientId)
  if (fault) {
    await appendEvent({
      kind: "rejected",
      recipientId,
      status: fault.status,
      error: fault.error,
    })
    return whatsappError(fault.status, 131000, fault.error)
  }
  try {
    const deleted = await updateMedia(mediaId, (record) => {
      if (record.deletedAt)
        throw new MediaError(`Media ID ${mediaId} was not found`, 404)
      return { ...record, deletedAt: Date.now() }
    })
    await appendEvent({
      kind: "media_deleted",
      recipientId: deleted?.deliveredTo ?? "",
      mediaId,
    })
  } catch (error) {
    if (error instanceof MediaError)
      return whatsappError(error.status, 100, error.message)
    throw error
  }
  return Response.json({ success: true })
}
