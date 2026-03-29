import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'Build OS', template: '%s · Build OS' },
  description: 'AI-native SaaS development operating system',
  icons: { icon: '/favicon.ico' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full bg-slate-25 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  )
}
