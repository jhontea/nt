'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function Home() {
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (isAuthenticated) router.push('/sessions')
    else router.push('/login')
  }, [isAuthenticated, router])

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-400">Loading...</p>
    </div>
  )
}
