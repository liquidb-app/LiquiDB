import type React from "react"
import type { Metadata } from "next"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import "./globals.css"

// Use system fonts as fallback for offline builds
// If Google Fonts are available, they will be used via CSS
const fontVariables = "font-sans"
const fontClassName = "antialiased"

export const metadata: Metadata = {
  title: "LiquiDB Manager",
  description: "Modern database management for macOS",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={fontClassName}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TooltipProvider>
            {children}
            <Toaster theme="system" />
          </TooltipProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  )
}
