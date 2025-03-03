import { memo } from "react"

import { formatDateDivider } from "@/lib/messageUtils"

interface DateDividerProps {
  timestamp: number
}

function DateDividerComponent({ timestamp }: DateDividerProps) {
  const formattedDate = formatDateDivider(timestamp)

  return (
    <div className="flex justify-center self-center">
      <div className="rounded-full bg-white px-4 py-1 text-sm text-muted-foreground shadow-sm">
        {formattedDate}
      </div>
    </div>
  )
}

// Comparison function for memoization
const areEqual = (prev: DateDividerProps, next: DateDividerProps) => {
  // For dates, we only need to compare if they represent the same day
  // This allows rerendering only when the date category changes (Today -> Yesterday, etc)
  const prevDate = new Date(prev.timestamp * 1000).setHours(0, 0, 0, 0)
  const nextDate = new Date(next.timestamp * 1000).setHours(0, 0, 0, 0)
  return prevDate === nextDate
}

export const DateDivider = memo(DateDividerComponent, areEqual)
