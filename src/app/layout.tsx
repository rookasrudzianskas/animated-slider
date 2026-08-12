import type { Metadata, Viewport } from 'next'

import './globals.css'

export const metadata: Metadata = {
  title: 'Age Progression',
  description: 'A scrolling age ruler that morphs a face from 5 to 95.',
}

export const viewport: Viewport = {
  themeColor: '#fdfdfd',
  width: 'device-width',
  initialScale: 1,
  // Deliberately no maximumScale/userScalable: blocking zoom is a WCAG 1.4.4
  // failure, and the ruler already claims the wheel through preventDefault
  // rather than by disabling the page's own gestures.
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">{children}</body>
    </html>
  )
}
