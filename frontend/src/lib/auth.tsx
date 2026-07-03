'use client'
import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'

interface AuthContextType {
  token: string | null
  login: (token: string) => void
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
    setToken(localStorage.getItem('token'))
  }, [])

  const login = useCallback((newToken: string) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
    router.push('/sessions')
  }, [router])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
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
