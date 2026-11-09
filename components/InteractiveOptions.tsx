import { useState } from "react"
import { List, SquareArrowOutUpRight } from "lucide-react"

import { type Interactive } from "@/types/events"
import { useChatActions } from "@/lib/chatActions"

const optionClass =
  "w-full rounded-lg bg-white px-3 py-2 text-center text-sm font-medium text-sky-700 shadow-sm hover:bg-sky-50 disabled:cursor-default disabled:text-gray-400"

export function InteractiveOptions({
  messageId,
  interactive,
}: {
  messageId: string
  interactive: Interactive
}) {
  const actions = useChatActions()
  const [listOpen, setListOpen] = useState(false)

  if (interactive.type === "button") {
    return (
      <div className="mt-1 flex flex-col gap-1">
        {interactive.action.buttons.map(({ reply }) => (
          <button
            key={reply.id}
            className={optionClass}
            disabled={!actions}
            onClick={() => actions?.reply(messageId, "button_reply", reply.id)}
          >
            {reply.title}
          </button>
        ))}
      </div>
    )
  }

  if (interactive.type === "list") {
    return (
      <div className="mt-1 flex flex-col gap-1">
        <button
          className={optionClass}
          disabled={!actions}
          aria-expanded={listOpen}
          onClick={() => setListOpen((open) => !open)}
        >
          <List className="mr-1 inline size-4" />
          {interactive.action.button}
        </button>
        {listOpen &&
          interactive.action.sections.map((section) => (
            <div
              key={section.title}
              role="listbox"
              aria-label={section.title}
              className="rounded-lg bg-white p-2 text-gray-900 shadow-sm"
            >
              <p className="px-1 pb-1 text-xs font-semibold text-gray-500">
                {section.title}
              </p>
              {section.rows.map((row) => (
                <button
                  key={row.id}
                  role="option"
                  aria-selected={false}
                  className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-sky-50"
                  onClick={() => {
                    setListOpen(false)
                    actions?.reply(messageId, "list_reply", row.id)
                  }}
                >
                  {row.title}
                  {row.description && (
                    <span className="block text-xs text-gray-500">
                      {row.description}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
      </div>
    )
  }

  return (
    <button
      className={`${optionClass} mt-1`}
      disabled={!actions}
      onClick={() => actions?.openFlow(messageId)}
    >
      <SquareArrowOutUpRight className="mr-1 inline size-4" />
      {interactive.action.parameters.flow_cta}
    </button>
  )
}
