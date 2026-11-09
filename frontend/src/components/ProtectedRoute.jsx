import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function ProtectedRoute({ roles, children }) {
  const { member, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div className="grid min-h-64 place-items-center text-sm text-slate-500">Loading your account…</div>
  if (!member) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(member.role)) return <Navigate to="/account" replace />
  return children
}
