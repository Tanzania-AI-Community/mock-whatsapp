"use client"

import { useEffect, useState, type ReactNode } from "react"
import { ChevronLeft, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

type Data = Record<string, unknown>
type FlowNode = { type: string } & Record<string, unknown>
interface FlowScreen {
  id: string
  title?: string
  refresh_on_back?: boolean
  layout: { children: FlowNode[] }
}
interface Option {
  id: string
  title: string
}

// Resolves ${data.x} and ${form.x} bindings, including inside action payloads
function resolve(value: unknown, data: Data, form: Data): unknown {
  if (typeof value === "string") {
    const match = /^\$\{(data|form)\.(\w+)\}$/.exec(value)
    if (match) return (match[1] === "data" ? data : form)[match[2]!]
    return value
  }
  if (Array.isArray(value)) return value.map((v) => resolve(v, data, form))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolve(v, data, form)])
    )
  }
  return value
}

const selectionTypes = new Set(["ChipsSelector", "CheckboxGroup"])

// Walks visible components in render order
function visibleNodes(nodes: FlowNode[], data: Data): FlowNode[] {
  return nodes.flatMap((node) => {
    if (node.type === "If") {
      const branch = resolve(node.condition, data, {}) ? node.then : node.else
      return visibleNodes((branch as FlowNode[] | undefined) ?? [], data)
    }
    if ("visible" in node && !resolve(node.visible, data, {})) return []
    return [node]
  })
}

function initialForm(nodes: FlowNode[], data: Data) {
  const form: Data = {}
  for (const node of visibleNodes(nodes, data)) {
    if (selectionTypes.has(node.type) && typeof node.name === "string") {
      const value = resolve(node["init-value"], data, {})
      form[node.name] = Array.isArray(value) ? value.map(String) : []
    }
  }
  return form
}

export function FlowDialog({
  messageId,
  onClose,
}: {
  messageId: string
  onClose: (completed: boolean) => void
}) {
  const [screens, setScreens] = useState<FlowScreen[]>([])
  const [screen, setScreen] = useState<{ id: string; data: Data } | null>(null)
  const [history, setHistory] = useState<{ id: string; data: Data }[]>([])
  const [form, setForm] = useState<Data>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(true)

  useEffect(() => {
    void fetch(
      `/api/flows/definition?messageId=${encodeURIComponent(messageId)}`
    )
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        const definition = result.definition as { screens: FlowScreen[] }
        setScreens(definition.screens)
        const first = result.screen ?? definition.screens[0]?.id
        show({ id: first, data: result.data }, definition.screens)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageId])

  const definitionOf = (id: string, all = screens) =>
    all.find((candidate) => candidate.id === id)

  function show(next: { id: string; data: Data }, all = screens) {
    const definition = definitionOf(next.id, all)
    if (!definition) {
      setError(`Twiga returned unknown screen ${next.id}`)
      return
    }
    setScreen(next)
    setForm(initialForm(definition.layout.children, next.data))
    setError(
      typeof next.data.error_message === "string"
        ? next.data.error_message
        : null
    )
  }

  async function exchange(action: "data_exchange" | "BACK", payload: Data) {
    if (!screen) return
    setBusy(true)
    try {
      const response = await fetch("/api/flows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          action,
          screen: screen.id,
          data: payload,
        }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error ?? "Flow request failed")
      if (result.screen === "SUCCESS") {
        onClose(true)
        return
      }
      if (action === "data_exchange") setHistory((h) => [...h, screen])
      else setHistory((h) => h.slice(0, -1))
      show({ id: result.screen, data: result.data ?? {} })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const definition = screen ? definitionOf(screen.id) : undefined
  const nodes =
    definition && screen
      ? visibleNodes(definition.layout.children, screen.data)
      : []

  function submit(node: FlowNode) {
    if (!screen) return
    for (const input of nodes) {
      const selected = form[String(input.name)] as string[] | undefined
      const min = Number(
        input["min-selected-items"] ?? (input.required ? 1 : 0)
      )
      if (selectionTypes.has(input.type) && (selected?.length ?? 0) < min) {
        setError(`Select at least ${min} option(s) for ${String(input.label)}`)
        return
      }
    }
    const action = node["on-click-action"] as { name: string; payload?: Data }
    if (action.name !== "data_exchange") {
      setError(`Flow action ${action.name} is not simulated locally`)
      return
    }
    void exchange(
      "data_exchange",
      resolve(action.payload ?? {}, screen.data, form) as Data
    )
  }

  function back() {
    const previous = history.at(-1)
    if (!screen || !previous) return
    if (definition?.refresh_on_back) void exchange("BACK", {})
    else {
      setHistory((h) => h.slice(0, -1))
      show(previous)
    }
  }

  function renderNode(node: FlowNode, index: number): ReactNode {
    const data = screen?.data ?? {}
    switch (node.type) {
      case "TextHeading":
      case "TextSubheading":
        return (
          <h3 key={index} className="font-semibold">
            {String(resolve(node.text, data, form) ?? "")}
          </h3>
        )
      case "TextBody":
      case "TextCaption":
        return (
          <p key={index} className="text-sm">
            {String(resolve(node.text, data, form) ?? "")}
          </p>
        )
      case "ChipsSelector":
      case "CheckboxGroup": {
        const name = String(node.name)
        const options =
          (resolve(node["data-source"], data, form) as Option[]) ?? []
        const selected = (form[name] as string[]) ?? []
        const max = Number(node["max-selected-items"] ?? Infinity)
        const toggle = (id: string) =>
          setForm((current) => {
            const values = (current[name] as string[]) ?? []
            return {
              ...current,
              [name]: values.includes(id)
                ? values.filter((v) => v !== id)
                : [...values, id],
            }
          })
        return (
          <fieldset key={index} className="space-y-2">
            <legend className="mb-1 text-sm font-medium">
              {String(node.label)}
            </legend>
            <div
              className={
                node.type === "ChipsSelector"
                  ? "flex flex-wrap gap-2"
                  : "space-y-1"
              }
            >
              {options.map((option) => {
                const checked = selected.includes(option.id)
                return (
                  <label
                    key={option.id}
                    className={
                      node.type === "ChipsSelector"
                        ? `cursor-pointer rounded-full border px-3 py-1 text-sm ${checked ? "border-green-700 bg-green-100" : "border-gray-300"}`
                        : "flex items-center gap-2 text-sm"
                    }
                  >
                    <input
                      type="checkbox"
                      className={
                        node.type === "ChipsSelector" ? "sr-only" : undefined
                      }
                      checked={checked}
                      disabled={!checked && selected.length >= max}
                      onChange={() => toggle(option.id)}
                    />
                    {option.title}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )
      }
      case "Footer":
        return (
          <Button
            key={index}
            className="w-full"
            disabled={busy}
            onClick={() => submit(node)}
          >
            {String(node.label)}
          </Button>
        )
      default:
        return (
          <p key={index} role="alert" className="text-sm text-red-700">
            Flow component {node.type} is not simulated locally
          </p>
        )
    }
  }

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col bg-white text-gray-900"
      role="dialog"
      aria-label="WhatsApp Flow"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <button aria-label="Close flow" onClick={() => onClose(false)}>
          <X className="size-5" />
        </button>
        {history.length > 0 && (
          <button aria-label="Back" onClick={back} disabled={busy}>
            <ChevronLeft className="size-5" />
          </button>
        )}
        <h2 className="flex-1 font-semibold">{definition?.title ?? "Flow"}</h2>
        {busy && <Loader2 className="size-4 animate-spin" />}
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}
        {nodes.filter((node) => node.type !== "Footer").map(renderNode)}
      </div>
      <div className="border-t p-3">
        {nodes.filter((node) => node.type === "Footer").map(renderNode)}
      </div>
    </div>
  )
}
