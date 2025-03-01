"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps } from "next-themes/dist/types"

import { Toaster } from "@/components/ui/sonner"
import { TailwindIndicator } from "@/components/tailwind-indicator"

export default function Providers({
  children,
  ...props
}: {
  children: React.ReactNode
} & ThemeProviderProps) {
  return (
    <NextThemesProvider {...props}>
      {children}
      <Toaster richColors />
      <TailwindIndicator />
    </NextThemesProvider>
  )
}
