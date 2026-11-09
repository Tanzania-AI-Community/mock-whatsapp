import { Download, ExternalLink, FileText } from "lucide-react"

import { type Message } from "@/types/chat"

export function MessageAttachment({
  media,
}: {
  media: NonNullable<Message["media"]>
}) {
  const src = `/api/media/${media.id}`
  if (media.kind === "image") {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Image message"
          className="max-h-96 w-full rounded-lg object-contain"
        />
      </a>
    )
  }
  if (media.kind === "audio") {
    return <audio controls src={src} className="w-64" />
  }
  return (
    <div className="flex items-center gap-3 rounded-lg bg-black/5 p-3">
      <FileText className="size-8 shrink-0 text-red-600" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium">
        {media.filename ?? "Document"}
      </span>
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        aria-label="Open document"
        className="text-gray-600 hover:text-gray-900"
      >
        <ExternalLink className="size-4" />
      </a>
      <a
        href={`${src}?download`}
        download={media.filename}
        aria-label="Download document"
        className="text-gray-600 hover:text-gray-900"
      >
        <Download className="size-4" />
      </a>
    </div>
  )
}
