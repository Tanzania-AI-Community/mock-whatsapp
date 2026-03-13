import { createHash, randomUUID } from "node:crypto"
import { promises as fs } from "node:fs"
import os from "node:os"
import path from "node:path"

const MEDIA_STORE_DIR = path.join(os.tmpdir(), "mock-whatsapp-media")
const MEDIA_ID_REGEX = /^[A-Za-z0-9._-]+$/

interface SaveMediaFromDataUrlInput {
  dataUrl: string
  mimeType?: string
  fileName?: string
}

interface StoredMediaFile {
  id: string
  mime_type: string
  file_size: number
  sha256: string
  filename?: string
  created_at: string
}

export interface StoredMediaReference {
  id: string
  mimeType: string
  fileSize: number
  sha256: string
  fileName?: string
}

interface MediaDownloadFile {
  bytes: Buffer
  mimeType: string
  fileName?: string
}

export interface MediaMetadataResponse {
  id: string
  url: string
  mime_type: string
  file_size: number
  sha256: string
  filename?: string
}

function isValidMediaId(mediaId: string): boolean {
  return MEDIA_ID_REGEX.test(mediaId)
}

function getMediaBinaryPath(mediaId: string) {
  return path.join(MEDIA_STORE_DIR, `${mediaId}.bin`)
}

function getMediaMetaPath(mediaId: string) {
  return path.join(MEDIA_STORE_DIR, `${mediaId}.json`)
}

function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Buffer } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)

  if (!match || !match[1] || !match[2]) {
    throw new Error("Invalid data URL format for image upload")
  }

  const mimeType = match[1]
  if (!mimeType.startsWith("image/")) {
    throw new Error("Only image uploads are supported")
  }

  return {
    mimeType,
    bytes: Buffer.from(match[2], "base64"),
  }
}

export async function saveMediaFromDataUrl({
  dataUrl,
  mimeType,
  fileName,
}: SaveMediaFromDataUrlInput): Promise<StoredMediaReference> {
  await fs.mkdir(MEDIA_STORE_DIR, { recursive: true })

  const parsed = parseDataUrl(dataUrl)
  const resolvedMimeType = mimeType ?? parsed.mimeType

  if (!resolvedMimeType.startsWith("image/")) {
    throw new Error("Invalid image mime type")
  }

  const mediaId = `media_${Date.now()}_${randomUUID().slice(0, 8)}`
  const sha256 = createHash("sha256").update(parsed.bytes).digest("hex")

  const mediaMetadata: StoredMediaFile = {
    id: mediaId,
    mime_type: resolvedMimeType,
    file_size: parsed.bytes.length,
    sha256,
    filename: fileName,
    created_at: new Date().toISOString(),
  }

  await Promise.all([
    fs.writeFile(getMediaBinaryPath(mediaId), parsed.bytes),
    fs.writeFile(
      getMediaMetaPath(mediaId),
      JSON.stringify(mediaMetadata, null, 2),
      "utf-8"
    ),
  ])

  return {
    id: mediaMetadata.id,
    mimeType: mediaMetadata.mime_type,
    fileSize: mediaMetadata.file_size,
    sha256: mediaMetadata.sha256,
    fileName: mediaMetadata.filename,
  }
}

export async function getMediaMetadata(
  mediaId: string,
  baseUrl: string
): Promise<MediaMetadataResponse | null> {
  if (!isValidMediaId(mediaId)) {
    return null
  }

  try {
    const rawMetadata = await fs.readFile(getMediaMetaPath(mediaId), "utf-8")
    const metadata = JSON.parse(rawMetadata) as StoredMediaFile

    return {
      id: metadata.id,
      url: `${baseUrl}/media/download/${mediaId}`,
      mime_type: metadata.mime_type,
      file_size: metadata.file_size,
      sha256: metadata.sha256,
      filename: metadata.filename,
    }
  } catch {
    return null
  }
}

export async function getMediaDownloadFile(
  mediaId: string
): Promise<MediaDownloadFile | null> {
  if (!isValidMediaId(mediaId)) {
    return null
  }

  try {
    const [rawMetadata, bytes] = await Promise.all([
      fs.readFile(getMediaMetaPath(mediaId), "utf-8"),
      fs.readFile(getMediaBinaryPath(mediaId)),
    ])
    const metadata = JSON.parse(rawMetadata) as StoredMediaFile

    return {
      bytes,
      mimeType: metadata.mime_type,
      fileName: metadata.filename,
    }
  } catch {
    return null
  }
}
