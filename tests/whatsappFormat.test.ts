import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseInline, parseWhatsAppText } from "@/lib/whatsappFormat"

const SOIL_EROSION_REPLY = `*Soil erosion* is the removal of the top layer of soil by agents such as wind, water, and human activities.

The two main causes are:
1. *Natural causes* — such as wind, rainfall, and running water
2. *Human activities* — such as deforestation, overgrazing, and poor farming practices

Would you like me to explain more about how each cause leads to soil erosion?`

describe("parseInline", () => {
  it("parses bold, italic, strikethrough and monospace", () => {
    assert.deepEqual(parseInline("*bold* _italic_ ~gone~ ```code```"), [
      { style: "bold", children: ["bold"] },
      " ",
      { style: "italic", children: ["italic"] },
      " ",
      { style: "strikethrough", children: ["gone"] },
      " ",
      { style: "code", children: ["code"] },
    ])
  })

  it("parses nested styles", () => {
    assert.deepEqual(parseInline("*_both_*"), [
      { style: "bold", children: [{ style: "italic", children: ["both"] }] },
    ])
  })

  it("does not format monospace contents", () => {
    assert.deepEqual(parseInline("`*not bold*`"), [
      { style: "code", children: ["*not bold*"] },
    ])
  })

  it("allows punctuation around a span", () => {
    assert.deepEqual(parseInline("(*Note*:)"), [
      "(",
      { style: "bold", children: ["Note"] },
      ":)",
    ])
  })

  it("leaves markers inside words and math as plain text", () => {
    assert.deepEqual(parseInline("2*3*4 = 24"), ["2*3*4 = 24"])
    assert.deepEqual(parseInline("snake_case_name"), ["snake_case_name"])
  })

  it("leaves unclosed or space-padded markers as plain text", () => {
    assert.deepEqual(parseInline("*not closed"), ["*not closed"])
    assert.deepEqual(parseInline("* not bold *"), ["* not bold *"])
  })

  it("keeps HTML as plain text", () => {
    assert.deepEqual(parseInline("<b>hi</b><script>alert(1)</script>"), [
      "<b>hi</b><script>alert(1)</script>",
    ])
  })
})

describe("parseWhatsAppText", () => {
  it("parses the soil erosion reply into bold spans, paragraphs and a numbered list", () => {
    assert.deepEqual(parseWhatsAppText(SOIL_EROSION_REPLY), [
      {
        type: "paragraph",
        content: [
          { style: "bold", children: ["Soil erosion"] },
          " is the removal of the top layer of soil by agents such as wind, water, and human activities.",
        ],
      },
      { type: "blank" },
      { type: "paragraph", content: ["The two main causes are:"] },
      {
        type: "numbered",
        indent: 0,
        marker: "1.",
        content: [
          { style: "bold", children: ["Natural causes"] },
          " — such as wind, rainfall, and running water",
        ],
      },
      {
        type: "numbered",
        indent: 0,
        marker: "2.",
        content: [
          { style: "bold", children: ["Human activities"] },
          " — such as deforestation, overgrazing, and poor farming practices",
        ],
      },
      { type: "blank" },
      {
        type: "paragraph",
        content: [
          "Would you like me to explain more about how each cause leads to soil erosion?",
        ],
      },
    ])
  })

  it("parses bulleted lists, including nested items", () => {
    assert.deepEqual(parseWhatsAppText("- wind\n* water\n  - rain"), [
      { type: "bulleted", indent: 0, content: ["wind"] },
      { type: "bulleted", indent: 0, content: ["water"] },
      { type: "bulleted", indent: 2, content: ["rain"] },
    ])
  })

  it("does not treat a bold line start as a bullet", () => {
    assert.deepEqual(parseWhatsAppText("*Bold* start"), [
      {
        type: "paragraph",
        content: [{ style: "bold", children: ["Bold"] }, " start"],
      },
    ])
  })

  it("keeps a plain message as a single paragraph", () => {
    assert.deepEqual(parseWhatsAppText("hello there"), [
      { type: "paragraph", content: ["hello there"] },
    ])
  })
})
