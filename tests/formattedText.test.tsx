import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"

import { FormattedText } from "@/components/FormattedText"

describe("FormattedText", () => {
  it("renders WhatsApp bold as <strong> without the asterisks", () => {
    const html = renderToStaticMarkup(
      <FormattedText text={"*Soil erosion* is the removal of topsoil."} />
    )
    assert.match(html, /<strong>Soil erosion<\/strong> is the removal/)
    assert.doesNotMatch(html, /\*/)
  })

  it("escapes HTML in message text", () => {
    const html = renderToStaticMarkup(
      <FormattedText text={'<img src=x onerror="alert(1)"> *hi*'} />
    )
    assert.doesNotMatch(html, /<img/)
    assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  })
})
