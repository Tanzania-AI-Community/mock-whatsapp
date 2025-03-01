import type { Metadata } from "next"

import { cn } from "@/lib/utils"
import Providers from "@/components/providers/providers"

import "./globals.css"

import { fontMono, fontSans } from "@/styles/fonts"

export const metadata: Metadata = {
  title: "Mock WhatsApp Chat",
  description: "A mock WhatsApp chat interface",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        suppressHydrationWarning={true}
        className={cn(
          "min-h-screen bg-muted-background font-sans antialiased",
          fontSans.variable,
          fontMono.variable
        )}
      >
        <Providers
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative flex min-h-screen flex-col">{children}</div>
        </Providers>
      </body>
    </html>
  )
}
