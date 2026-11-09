import { mediaResponse, readMedia } from "@/lib/mediaStore"
import { checkLocalRequest } from "@/lib/mockTransport"

export const runtime = "nodejs"

// Browser view of media that appears in the chat
export async function GET(
  request: Request,
  { params }: { params: Promise<{ mediaId: string }> }
) {
  const denied = checkLocalRequest(request)
  if (denied) return denied
  const { mediaId } = await params
  const media = await readMedia(mediaId)
  if (!media || (media.direction === "outgoing" && !media.deliveredTo))
    return Response.json({ error: "Media not found" }, { status: 404 })
  const download = new URL(request.url).searchParams.has("download")
  const response = await mediaResponse(
    media,
    download ? "attachment" : "inline"
  )
  return response
}
