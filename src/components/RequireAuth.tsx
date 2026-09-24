import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'

export default function RequireAuth({ children }: { children: ReactNode }) {
  const credentials = useAuthStore((s) => s.credentials)
  if (!credentials) return <Navigate to="/login" replace />
  return <>{children}</>
}
