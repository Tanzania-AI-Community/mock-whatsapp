import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { webmOpusToOgg } from "@/lib/oggOpus"

const UNKNOWN_SIZE = [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]

function size(length: number) {
  return [0x10 | (length >> 24), length >> 16, length >> 8, length].map(
    (byte) => byte & 0xff
  )
}

const element = (id: number[], data: number[]) => [
  ...id,
  ...size(data.length),
  ...data,
]

const opusHead = [
  ...Buffer.from("OpusHead"),
  1,
  1,
  0,
  0,
  0x80,
  0xbb,
  0,
  0,
  0,
  0,
  0,
]

const simpleBlock = (packet: number[], flags = 0x80) =>
  element([0xa3], [0x81, 0, 0, flags, ...packet])

function webm(clusters: number[][], codec = "A_OPUS") {
  const track = [
    ...element([0x86], [...Buffer.from(codec)]),
    ...element([0x63, 0xa2], opusHead),
  ]
  return Uint8Array.from([
    ...element([0x1a, 0x45, 0xdf, 0xa3], [0x42, 0x86, 0x81, 1]),
    ...[0x18, 0x53, 0x80, 0x67],
    ...UNKNOWN_SIZE,
    ...element([0x16, 0x54, 0xae, 0x6b], element([0xae], track)),
    ...clusters.flatMap((blocks) => [
      ...[0x1f, 0x43, 0xb6, 0x75],
      ...UNKNOWN_SIZE,
      ...element([0xe7], [0]),
      ...blocks,
    ]),
  ])
}

// Bitwise, so it does not share the converter's lookup table
function oggCrc(bytes: Uint8Array) {
  let crc = 0
  for (const byte of bytes) {
    crc ^= byte << 24
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1
    }
  }
  return crc >>> 0
}

function readPages(ogg: Uint8Array) {
  const pages = []
  let offset = 0
  while (offset < ogg.length) {
    const view = new DataView(ogg.buffer, ogg.byteOffset + offset)
    assert.equal(
      Buffer.from(ogg.subarray(offset, offset + 4)).toString(),
      "OggS"
    )
    const segments = ogg[offset + 26]
    const lacing = [...ogg.subarray(offset + 27, offset + 27 + segments)]
    const bodyStart = offset + 27 + segments
    const end = bodyStart + lacing.reduce((sum, value) => sum + value, 0)

    const unsigned = ogg.slice(offset, end)
    unsigned.fill(0, 22, 26)
    assert.equal(view.getUint32(22, true), oggCrc(unsigned))

    const packets: number[][] = []
    let cursor = bodyStart
    let length = 0
    for (const value of lacing) {
      length += value
      if (value < 255) {
        packets.push([...ogg.subarray(cursor, cursor + length)])
        cursor += length
        length = 0
      }
    }
    pages.push({
      flags: ogg[offset + 5],
      granule: view.getUint32(6, true),
      serial: view.getUint32(14, true),
      sequence: view.getUint32(18, true),
      packets,
    })
    offset = end
  }
  return pages
}

describe("webmOpusToOgg", () => {
  it("rewraps Opus packets from unknown-size clusters", () => {
    // Code 3 with five 20 ms frames, then a single 20 ms frame
    const first = [0xfb, 0x05, 1, 2, 3]
    const second = [0xf8, 4, 5]
    const pages = readPages(
      webmOpusToOgg(webm([[...simpleBlock(first)], [...simpleBlock(second)]]))
    )

    assert.equal(pages.length, 3)
    assert.deepEqual(pages[0].packets, [opusHead])
    assert.equal(pages[0].flags, 0x02)
    assert.equal(pages[0].granule, 0)
    assert.equal(
      Buffer.from(pages[1].packets[0].slice(0, 8)).toString(),
      "OpusTags"
    )
    assert.equal(pages[1].granule, 0)
    assert.deepEqual(pages[2].packets, [first, second])
    assert.equal(pages[2].flags, 0x04)
    assert.equal(pages[2].granule, 6 * 960)
    assert.deepEqual(
      pages.map(({ sequence }) => sequence),
      [0, 1, 2]
    )
    assert.equal(new Set(pages.map(({ serial }) => serial)).size, 1)
  })

  it("splits long recordings across pages without splitting packets", () => {
    const packet = [0xf8, ...new Array<number>(254).fill(7)]
    const blocks = Array.from({ length: 300 }, () => simpleBlock(packet))
    const pages = readPages(webmOpusToOgg(webm([blocks.flat()])))
    const audio = pages.slice(2)

    assert.equal(audio.flatMap(({ packets }) => packets).length, 300)
    assert.equal(audio.at(-1)?.granule, 300 * 960)
    assert.equal(audio.at(-1)?.flags, 0x04)
    assert.ok(audio.slice(0, -1).every(({ flags }) => flags === 0))
    assert.ok(audio[0].granule < audio[1].granule)
  })

  it("rejects recordings it cannot rewrap", () => {
    assert.throws(() => webmOpusToOgg(webm([], "A_OPUS")), /no audio/i)
    assert.throws(
      () => webmOpusToOgg(webm([simpleBlock([0xf8, 1])], "A_VORBIS")),
      /opus/i
    )
    assert.throws(
      () => webmOpusToOgg(webm([simpleBlock([0xf8, 1], 0x82)])),
      /lacing/i
    )
  })
})
