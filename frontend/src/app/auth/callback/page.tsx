'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth'

export default function AuthCallbackPage() {
  const { login } = useAuth()
  const router = useRouter()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (token) {
      login(token, true)
    } else {
      router.push('/login?error=no_token')
    }
  }, [login, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] dark:bg-[#141411]">
      <p className="text-[#686868] dark:text-[#898989] text-sm">Mengautentikasi...</p>
    </div>
  )
}
