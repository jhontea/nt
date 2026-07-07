'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  token: string | null
  login: (token: string, remember?: boolean) => void
  logout: () => void
  isAuthenticated: boolean
  initialized: boolean
}

const AuthContext = createContext<AuthContextType>({
  token: null,
  login: () => {},
  logout: () => {},
  isAuthenticated: false,
  initialized: false,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null)
  const [initialized, setInitialized] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const stored = localStorage.getItem('token') || sessionStorage.getItem('token')
    setToken(stored)
    setInitialized(true)
  }, [])

  const login = useCallback((newToken: string, remember: boolean = true) => {
    if (remember) {
      localStorage.setItem('token', newToken)
    } else {
      sessionStorage.setItem('token', newToken)
    }
    setToken(newToken)
    setInitialized(true)
    router.push('/sessions')
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    sessionStorage.removeItem('token')
    setToken(null)
    router.push('/login')
  }, [router])

  return (
    <AuthContext.Provider value={{ token, login, logout, isAuthenticated: !!token, initialized }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
