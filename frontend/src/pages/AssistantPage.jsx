import { useEffect, useRef, useState } from 'react'
import { ArrowUp, Bot, LoaderCircle, Sparkles, UserRound } from 'lucide-react'
import { apiErrorMessage } from '../api/client'
import { useNotifications } from '../contexts/NotificationContext'
import { askAssistant } from '../services/aiService'

const suggestions = [
  'How do I renew a library loan?',
  'How can I search for a book?',
  'What should I do if a book is overdue?'
]

export default function AssistantPage() {
  const [messages, setMessages] = useState([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef(null)
  const { notify } = useNotifications()

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function submit(event, prompt = message) {
    event?.preventDefault()
    const text = prompt.trim()
    if (!text || busy) return
    setMessage('')
    setMessages((current) => [...current, { role: 'user', content: text }])
    setBusy(true)
    try {
      const response = await askAssistant(text)
      setMessages((current) => [...current, { role: 'assistant', content: response.reply }])
    } catch (error) {
      const detail = apiErrorMessage(error)
      setMessages((current) => [...current, { role: 'assistant', content: detail, failed: true }])
      notify(detail, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto flex min-h-[calc(100vh-132px)] max-w-4xl flex-col px-4 py-8 sm:px-6">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[.15em] text-blue-700">AI library assistant</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-navy-900">Ask a library question</h1>
        <p className="mt-2 text-sm text-slate-500">General guidance powered by the configured AI service. It cannot see live member accounts or library policies.</p>
      </div>
      <div className="flex flex-1 flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
          <span className="grid size-9 place-items-center rounded-full bg-blue-50 text-blue-800"><Bot size={19} /></span>
          <div><p className="text-sm font-semibold text-slate-800">Library assistant</p><p className="text-[11px] text-slate-500">Nemotron · single-turn AI service</p></div>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
          {!messages.length && <div className="mx-auto mt-10 max-w-md text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-amber-50 text-amber-700"><Sparkles size={21} /></span><h2 className="mt-4 font-serif text-xl font-semibold text-slate-800">What would you like to know?</h2><p className="mt-2 text-sm leading-6 text-slate-500">Ask for help finding books or navigating common library services.</p><div className="mt-5 flex flex-wrap justify-center gap-2">{suggestions.map((item) => <button key={item} className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-800" onClick={() => submit(null, item)}>{item}</button>)}</div></div>}
          {messages.map((item, index) => <div key={`${item.role}-${index}`} className={`flex gap-2.5 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {item.role === 'assistant' && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-800"><Bot size={16} /></span>}
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-3 text-sm leading-6 ${item.role === 'user' ? 'rounded-br-sm bg-navy-900 text-white' : item.failed ? 'rounded-bl-sm bg-red-50 text-red-800' : 'rounded-bl-sm bg-slate-100 text-slate-700'}`}>{item.content}</p>
            {item.role === 'user' && <span className="grid size-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><UserRound size={16} /></span>}
          </div>)}
          {busy && <div className="flex items-center gap-2 text-xs text-slate-500"><LoaderCircle className="animate-spin" size={16} />Generating a response…</div>}
          <div ref={endRef} />
        </div>
        <form className="flex gap-2 border-t border-slate-100 p-3 sm:p-4" onSubmit={submit}>
          <label className="sr-only" htmlFor="assistant-message">Your question</label>
          <input id="assistant-message" className="form-control flex-1" value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write your question…" maxLength={4000} disabled={busy} />
          <button type="submit" className="btn btn-primary size-11 px-0" disabled={busy || !message.trim()} aria-label="Send"><ArrowUp size={18} /></button>
        </form>
      </div>
      <p className="mt-3 text-center text-[11px] text-slate-400">Do not share passwords, payment PINs, or sensitive personal information.</p>
    </section>
  )
}
