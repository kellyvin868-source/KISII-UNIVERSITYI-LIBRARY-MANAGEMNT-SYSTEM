import { AlertCircle, LoaderCircle } from 'lucide-react'

export function LoadingState({ label = 'Loading…' }) {
  return <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-slate-500"><LoaderCircle className="animate-spin" size={18} />{label}</div>
}

export function ErrorState({ message, retry }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
      <span className="flex items-center gap-2"><AlertCircle size={17} />{message}</span>
      {retry && <button className="font-semibold underline" onClick={retry}>Try again</button>}
    </div>
  )
}

export function EmptyState({ title, children }) {
  return <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><p className="font-semibold text-slate-700">{title}</p>{children && <p className="mt-1 text-sm text-slate-500">{children}</p>}</div></div>
}
