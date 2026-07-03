'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { useState, ReactNode } from 'react'

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
