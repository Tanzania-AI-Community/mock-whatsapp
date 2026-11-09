// Chrome records Opus in WebM, while WhatsApp voice notes are Opus in Ogg. This
// moves the packets between the two containers without re-encoding the audio.

const SEGMENT = 0x18538067
const CLUSTER = 0x1f43b675
const TRACKS = 0x1654ae6b
const TRACK_ENTRY = 0xae
const BLOCK_GROUP = 0xa0
const BLOCK = 0xa1
const SIMPLE_BLOCK = 0xa3
const CODEC_ID = 0x86
const CODEC_PRIVATE = 0x63a2

// Live recordings leave Segment and Cluster sizes unknown, so these are read
// through rather than skipped
const CONTAINERS = new Set([SEGMENT, CLUSTER, TRACKS, TRACK_ENTRY, BLOCK_GROUP])

const OGG_FIRST_PAGE = 0x02
const OGG_LAST_PAGE = 0x04
const MAX_PAGE_SEGMENTS = 255

function readVint(bytes: Uint8Array, offset: number, keepMarker: boolean) {
  const first = bytes[offset]
  if (!first) throw new Error("Invalid WebM data")
  const length = Math.clz32(first) - 23
  const mask = 0xff >> length
  let value = keepMarker ? first : first & mask
  let unknown = (first & mask) === mask
  for (let i = 1; i < length; i++) {
    const byte = bytes[offset + i]
    if (byte === undefined) throw new Error("Truncated WebM data")
    value = value * 256 + byte
    unknown &&= byte === 0xff
  }
  return { value, length, unknown }
}

function blockPacket(block: Uint8Array) {
  const headerLength = readVint(block, 0, false).length + 3
  if (block[headerLength - 1] & 0x06) {
    throw new Error("WebM block lacing is not supported")
  }
  return block.subarray(headerLength)
}

function readWebm(webm: Uint8Array) {
  let codec = ""
  let opusHead: Uint8Array | undefined
  const packets: Uint8Array[] = []
  let offset = 0
  while (offset < webm.length) {
    const id = readVint(webm, offset, true)
    const size = readVint(webm, offset + id.length, false)
    const start = offset + id.length + size.length
    if (CONTAINERS.has(id.value)) {
      offset = start
      continue
    }
    if (size.unknown) throw new Error("Unsupported WebM layout")
    const data = webm.subarray(start, start + size.value)
    if (id.value === CODEC_ID) codec = new TextDecoder().decode(data)
    if (id.value === CODEC_PRIVATE) opusHead = data
    if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
      packets.push(blockPacket(data))
    }
    offset = start + size.value
  }
  if (codec !== "A_OPUS" || !opusHead) {
    throw new Error("The recording is not Opus audio")
  }
  return { opusHead, packets }
}

// RFC 6716 section 3.1: the first byte gives the frame length and count
function packetSamples(packet: Uint8Array) {
  const config = packet[0] >> 3
  const frameMs =
    config < 12
      ? [10, 20, 40, 60][config % 4]
      : config < 16
        ? [10, 20][config % 2]
        : [2.5, 5, 10, 20][config % 4]
  const code = packet[0] & 3
  const frames = code === 0 ? 1 : code === 3 ? packet[1] & 0x3f : 2
  return frameMs * 48 * frames
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
  let crc = index << 24
  for (let bit = 0; bit < 8; bit++) {
    crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1
  }
  return crc >>> 0
})

function oggCrc(bytes: Uint8Array) {
  let crc = 0
  for (const byte of bytes) {
    crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0
  }
  return crc
}

function segmentCount(packet: Uint8Array) {
  return Math.floor(packet.length / 255) + 1
}

function oggPage(
  packets: Uint8Array[],
  { granule, serial, sequence, flags = 0 }: OggPageOptions
) {
  const lacing = packets.flatMap((packet) => [
    ...new Array<number>(segmentCount(packet) - 1).fill(255),
    packet.length % 255,
  ])
  const bodyLength = packets.reduce((sum, { length }) => sum + length, 0)
  const page = new Uint8Array(27 + lacing.length + bodyLength)
  const view = new DataView(page.buffer)
  page.set(new TextEncoder().encode("OggS"))
  page[5] = flags
  view.setUint32(6, granule % 2 ** 32, true)
  view.setUint32(10, Math.floor(granule / 2 ** 32), true)
  view.setUint32(14, serial, true)
  view.setUint32(18, sequence, true)
  page[26] = lacing.length
  page.set(lacing, 27)
  let offset = 27 + lacing.length
  for (const packet of packets) {
    page.set(packet, offset)
    offset += packet.length
  }
  view.setUint32(22, oggCrc(page), true)
  return page
}

type OggPageOptions = {
  granule: number
  serial: number
  sequence: number
  flags?: number
}

function opusTags() {
  const vendor = new TextEncoder().encode("mock-whatsapp")
  const tags = new Uint8Array(8 + 4 + vendor.length + 4)
  tags.set(new TextEncoder().encode("OpusTags"))
  new DataView(tags.buffer).setUint32(8, vendor.length, true)
  tags.set(vendor, 12)
  return tags
}

export function webmOpusToOgg(webm: Uint8Array) {
  const { opusHead, packets } = readWebm(webm)
  const audio = packets.filter((packet) => packet.length > 0)
  if (audio.length === 0) throw new Error("The recording has no audio")

  const serial = Math.floor(Math.random() * 2 ** 32)
  const pages = [
    oggPage([opusHead], {
      granule: 0,
      serial,
      sequence: 0,
      flags: OGG_FIRST_PAGE,
    }),
    oggPage([opusTags()], { granule: 0, serial, sequence: 1 }),
  ]

  let granule = 0
  let pending: Uint8Array[] = []
  let pendingSegments = 0
  audio.forEach((packet, index) => {
    pending.push(packet)
    pendingSegments += segmentCount(packet)
    granule += packetSamples(packet)
    const next = audio[index + 1]
    if (next && pendingSegments + segmentCount(next) <= MAX_PAGE_SEGMENTS) {
      return
    }
    pages.push(
      oggPage(pending, {
        granule,
        serial,
        sequence: pages.length,
        flags: next ? 0 : OGG_LAST_PAGE,
      })
    )
    pending = []
    pendingSegments = 0
  })

  const ogg = new Uint8Array(pages.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const page of pages) {
    ogg.set(page, offset)
    offset += page.length
  }
  return ogg
}
