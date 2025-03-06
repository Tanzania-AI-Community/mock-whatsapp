import React from "react"

import { formatToolName } from "@/lib/utils"

interface ToolTagProps {
  toolName: string | null | undefined
}

export function ToolTag({ toolName }: ToolTagProps) {
  if (!toolName) return null

  const formattedName = formatToolName(toolName)

  return (
    <span className="ml-1 inline-block rounded-md bg-blue-100 px-1.5 py-0.5 text-sm font-semibold text-blue-700">
      {formattedName}
    </span>
  )
}
