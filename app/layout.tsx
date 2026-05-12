import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { AppShell } from '@/components/layout/AppShell'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Lead to Customer CRM',
  description: 'Sistema de gestión de leads — NoCode Jose',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body
        className="h-full flex"
        style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
