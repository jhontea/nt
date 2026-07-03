'use client'
import { useQuery } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'

export default function SessionDetailPage() {
  const { id } = useParams()
  const { isAuthenticated } = useAuth()
  const router = useRouter()

  useEffect(() => { if (!isAuthenticated) router.push('/login') }, [isAuthenticated, router])

  const { data: session, isLoading } = useQuery({
    queryKey: ['session', id],
    queryFn: () => api.sessions.get(Number(id)),
    enabled: isAuthenticated,
  })

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>
  if (!session) return <div className="p-6 text-gray-400">Session not found</div>

  let configDisplay: any = {}
  try { configDisplay = JSON.parse(session.config) } catch {}

  return (
    <div className="max-w-4xl mx-auto p-6">
      <button onClick={() => router.push('/sessions')} className="text-gray-400 hover:text-white mb-4 block">&larr; Back</button>
      <h1 className="text-2xl font-bold mb-4">{session.name}</h1>
      <div className="bg-gray-900 p-4 rounded-xl mb-6 grid grid-cols-2 gap-4 text-sm">
        <div><span className="text-gray-400">Symbol:</span> {session.symbol}</div>
        <div><span className="text-gray-400">Strategy:</span> {session.strategy}</div>
        <div><span className="text-gray-400">Mode:</span> {session.mode}</div>
        <div><span className="text-gray-400">Status:</span> {session.status}</div>
        <div className="col-span-2">
          <span className="text-gray-400">Config:</span>
          <pre className="mt-1 bg-gray-800 p-2 rounded text-xs">{JSON.stringify(configDisplay, null, 2)}</pre>
        </div>
      </div>
    </div>
  )
}
