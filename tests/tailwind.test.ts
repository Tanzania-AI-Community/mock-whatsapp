import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { test } from "node:test"
import { fileURLToPath } from "node:url"
import tailwindcss from "@tailwindcss/postcss"
import postcss from "postcss"

const stylesheetPath = fileURLToPath(
  new URL("../app/globals.css", import.meta.url)
)

test("Tailwind theme utilities compile with their migrated definitions", async () => {
  const stylesheet = await readFile(stylesheetPath, "utf8")
  const source = `${stylesheet}\n@source inline("motion-safe:animate-typing-dot dark:bg-main rounded-sm text-main-foreground");`
  const { css } = await postcss([tailwindcss()]).process(source, {
    from: stylesheetPath,
  })

  assert.ok(
    css.includes("@keyframes typing-dot"),
    "typing-dot keyframes compile"
  )
  assert.ok(
    css.includes(".motion-safe\\:animate-typing-dot"),
    "typing-dot utility compiles"
  )
  assert.ok(
    css.includes("prefers-reduced-motion: no-preference"),
    "typing animation respects reduced motion"
  )
  assert.ok(
    css.includes(".dark\\:bg-main:where(.dark, .dark *)"),
    "class-based dark variant compiles"
  )
  assert.ok(
    css.includes("--radius-sm: calc(var(--radius) - 4px)"),
    "small radius preserves the Tailwind 3 value"
  )
  const roundedRule = css.match(/\.rounded-sm\s*\{[^}]+\}/)?.[0]
  assert.ok(roundedRule, "rounded-sm utility compiles")
  assert.match(roundedRule, /border-radius: calc\(var\(--radius\) - 4px\)/)
  assert.ok(
    css.includes(".text-main-foreground") &&
      css.includes("color: hsl(var(--main-foreground))"),
    "custom foreground color compiles"
  )
})
