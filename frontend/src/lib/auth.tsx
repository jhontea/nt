'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  token: string | null
  login: (token: string, remember?: boolean) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // Check localStorage first (persistent), then sessionStorage (session-only)
    const stored = localStorage.getItem('token') || sessionStorage.getItem('token')
    setToken(stored)
  }, [])

  const login = useCallback((newToken: string, remember: boolean = true) => {
    if (remember) {
      localStorage.setItem('token', newToken)
    } else {
      sessionStorage.setItem('token', newToken)
    }
    setToken(newToken)
    router.push('/sessions')
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    setToken(null)
    router.push('/login')
  }, [router])

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
