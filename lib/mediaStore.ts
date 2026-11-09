import { createHash, randomBytes } from "node:crypto"
import { createReadStream } from "node:fs"
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import path from "node:path"
import { Readable } from "node:stream"

const MB = 1024 * 1024

// Meta Cloud API media limits for the types Twiga sends or receives
export const mediaLimits: Record<string, number> = {
  "image/jpeg": 5 * MB,
  "image/png": 5 * MB,
  "application/pdf": 100 * MB,
  "audio/aac": 16 * MB,
  "audio/amr": 16 * MB,
  "audio/mpeg": 16 * MB,
  "audio/mp4": 16 * MB,
  "audio/ogg": 16 * MB,
}
export const outgoingTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
])
export const MAX_MEDIA_BYTES = 100 * MB
const MAX_IMAGE_EDGE = 4096

export interface MediaRecord {
  id: string
  mimeType: string
  size: number
  sha256: string
  filename?: string
  direction: "outgoing" | "inbound"
  createdAt: number
  deliveredTo?: string
  deletedAt?: number
}

export class MediaError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message)
  }
}

const state = globalThis as typeof globalThis & {
  whatsappMediaWrites?: Promise<unknown>
}

function mediaDir() {
  return path.join(
    process.env.MOCK_WHATSAPP_DATA_DIR ??
      path.join(process.cwd(), ".mock-whatsapp"),
    "media"
  )
}

const isMediaId = (id: string) => /^\d{12,20}$/.test(id)
const filePath = (id: string) => path.join(mediaDir(), id)
const metaPath = (id: string) => path.join(mediaDir(), `${id}.json`)

// Meta media IDs are numeric strings
function newMediaId() {
  return (BigInt(`0x${randomBytes(7).toString("hex")}`) + 10n ** 15n).toString()
}

export function baseMimeType(value: string) {
  return value.split(";")[0]!.trim().toLowerCase()
}

function matchesSignature(mimeType: string, head: Buffer) {
  const starts = (...bytes: number[]) =>
    bytes.every((byte, index) => head[index] === byte)
  switch (mimeType) {
    case "image/png":
      return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case "image/jpeg":
      return starts(0xff, 0xd8, 0xff)
    case "application/pdf":
      return head.subarray(0, 5).toString("latin1") === "%PDF-"
    case "audio/ogg":
      return head.subarray(0, 4).toString("latin1") === "OggS"
    case "audio/mpeg":
      return (
        head.subarray(0, 3).toString("latin1") === "ID3" ||
        (head[0] === 0xff && (head[1]! & 0xe0) === 0xe0)
      )
    case "audio/mp4":
      return head.subarray(4, 8).toString("latin1") === "ftyp"
    case "audio/aac":
      return head[0] === 0xff && (head[1]! & 0xf6) === 0xf0
    case "audio/amr":
      return head.subarray(0, 5).toString("latin1") === "#!AMR"
    default:
      return false
  }
}

function imageSize(mimeType: string, data: Buffer) {
  if (mimeType === "image/png") {
    if (data.length < 33) return null
    return {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      bitDepth: data[24],
      colorType: data[25],
    }
  }
  // Walk JPEG segments until a start-of-frame marker
  let offset = 2
  while (offset + 9 < data.length && data[offset] === 0xff) {
    const marker = data[offset + 1]!
    const length = data.readUInt16BE(offset + 2)
    const isFrame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    if (isFrame) {
      return {
        height: data.readUInt16BE(offset + 5),
        width: data.readUInt16BE(offset + 7),
        bitDepth: data[offset + 4],
      }
    }
    offset += 2 + length
  }
  return null
}

// Validates the bytes and stores them under a new numeric media ID
export async function saveMedia(
  file: File,
  {
    direction,
    allowed,
    filename,
  }: {
    direction: MediaRecord["direction"]
    allowed: Set<string>
    filename?: string
  }
): Promise<MediaRecord> {
  const mimeType = baseMimeType(file.type)
  if (!allowed.has(mimeType)) {
    throw new MediaError(`Unsupported media type: ${file.type || "unknown"}`)
  }
  const limit = mediaLimits[mimeType]!
  if (file.size === 0) throw new MediaError("Media file is empty")
  if (file.size > limit) {
    throw new MediaError(
      `Media size ${file.size} exceeds the ${limit} byte limit for ${mimeType}`,
      413
    )
  }
  const data = Buffer.from(await file.arrayBuffer())
  if (!matchesSignature(mimeType, data.subarray(0, 16))) {
    throw new MediaError(`File content does not match ${mimeType}`)
  }
  if (direction === "outgoing" && mimeType.startsWith("image/")) {
    const size = imageSize(mimeType, data)
    if (!size || size.bitDepth !== 8) {
      throw new MediaError("Images must be 8-bit RGB or RGBA")
    }
    if ("colorType" in size && size.colorType !== 2 && size.colorType !== 6) {
      throw new MediaError("Images must be 8-bit RGB or RGBA")
    }
    if (Math.max(size.width, size.height) > MAX_IMAGE_EDGE) {
      throw new MediaError(
        `Image is ${size.width}x${size.height}; the maximum edge is ${MAX_IMAGE_EDGE}px`
      )
    }
  }

  const record: MediaRecord = {
    id: newMediaId(),
    mimeType,
    size: data.length,
    sha256: createHash("sha256").update(data).digest("base64"),
    direction,
    createdAt: Date.now(),
    ...(filename ? { filename: safeFilename(filename) } : {}),
  }
  await mkdir(mediaDir(), { recursive: true, mode: 0o700 })
  const temporary = `${filePath(record.id)}.${process.pid}.tmp`
  await writeFile(temporary, data, { mode: 0o600 })
  await rename(temporary, filePath(record.id))
  await writeFile(metaPath(record.id), JSON.stringify(record), { mode: 0o600 })
  return record
}

export function safeFilename(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()]/g, "_")
  return base.slice(-120) || "file"
}

export async function readMedia(id: string): Promise<MediaRecord | null> {
  if (!isMediaId(id)) return null
  await state.whatsappMediaWrites
  try {
    return JSON.parse(await readFile(metaPath(id), "utf8")) as MediaRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null
    throw error
  }
}

// Serialized so concurrent sends and deletes do not lose updates
export function updateMedia(
  id: string,
  change: (record: MediaRecord) => MediaRecord | Promise<MediaRecord>
): Promise<MediaRecord | null> {
  const write = (state.whatsappMediaWrites ?? Promise.resolve()).then(
    async () => {
      if (!isMediaId(id)) return null
      let record: MediaRecord
      try {
        record = JSON.parse(await readFile(metaPath(id), "utf8"))
      } catch {
        return null
      }
      const updated = await change(record)
      await writeFile(metaPath(id), JSON.stringify(updated), { mode: 0o600 })
      return updated
    }
  )
  state.whatsappMediaWrites = write.catch(() => {})
  return write
}

export async function mediaResponse(
  record: MediaRecord,
  disposition: "inline" | "attachment" = "inline"
) {
  const file = filePath(record.id)
  const { size } = await stat(file)
  const filename = record.filename ?? `${record.id}`
  return new Response(
    Readable.toWeb(createReadStream(file)) as ReadableStream,
    {
      headers: {
        "Content-Type": record.mimeType,
        "Content-Length": String(size),
        "Content-Disposition": `${disposition}; filename="${filename}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    }
  )
}
