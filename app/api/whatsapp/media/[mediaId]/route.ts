import { mediaResponse, readMedia } from "@/lib/mediaStore"
import {
  applyFault,
  checkLocalRequest,
  whatsappError,
} from "@/lib/mockTransport"

export const runtime = "nodejs"

// The bearer-protected download URL returned by GET /{media-id}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const denied = checkLocalRequest(request, true)
  if (denied) return denied
  const { mediaId } = await params
  const media = await readMedia(mediaId)
  if (!media || media.deletedAt)
    return whatsappError(404, 100, `Media ID ${mediaId} was not found`)
  const fault = await applyFault("download")
  if (fault) return whatsappError(fault.status, 131052, fault.error)
  return mediaResponse(media, "attachment")
}
