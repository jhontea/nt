import type { Metadata } from 'next'
import { Providers } from './providers'
import './globals.css'
import { Geist, Inter } from 'next/font/google'

const geist = Geist({ subsets: ['latin'], variable: '--font-geist' })
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })

export const metadata: Metadata = {
  title: 'Trading Bot',
  description: 'Personal trading bot dashboard',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${inter.variable}`} suppressHydrationWarning>
      <body className="bg-[#fafafa] text-[#0e0f0c] min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
