import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, BookCopy, BookOpen, CheckCircle2 } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { apiErrorMessage } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { borrowBook } from '../services/loansService'
import { getBook, listBookCopies } from '../services/booksService'
import { reserveBook } from '../services/reservationsService'
import { recordId } from '../utils/records'

export default function BookDetailPage() {
  const { id } = useParams()
  const { member } = useAuth()
  const { notify } = useNotifications()
  const [book, setBook] = useState(null)
  const [copies, setCopies] = useState([])
  const [busy, setBusy] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [copiesError, setCopiesError] = useState('')

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setBusy(true)
    try {
      const details = await getBook(id)
      setError('')
      setBook(details.data || details)
      try {
        setCopies(await listBookCopies(id))
        setCopiesError('')
      } catch (copyError) {
        setCopies([])
        setCopiesError(apiErrorMessage(copyError))
      }
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }, [id])

  // The initial request owns async loading/error state updates after its network calls.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(false) }, [load])

  async function performAction(action) {
    if (!member) {
      notify('Sign in before borrowing or reserving a book.', 'error')
      return
    }
    setWorking(true)
    try {
      if (action === 'borrow') await borrowBook(member.id, id)
      else await reserveBook(member.id, id)
      notify(action === 'borrow' ? 'The loan has been created.' : 'Your reservation has been placed.')
      await load()
    } catch (requestError) {
      notify(apiErrorMessage(requestError), 'error')
    } finally {
      setWorking(false)
    }
  }

  if (busy) return <div className="mx-auto max-w-6xl px-4 py-12"><LoadingState label="Loading book details…" /></div>
  if (error || !book) return <div className="mx-auto max-w-6xl px-4 py-12"><ErrorState message={error || 'Book not found.'} retry={load} /></div>

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <Link to="/" className="mb-8 inline-flex items-center gap-2 text-sm text-slate-600 hover:text-blue-800"><ArrowLeft size={16} /> Back to catalog</Link>
      <div className="grid gap-10 md:grid-cols-[.8fr_1.2fr]">
        <div className="grid min-h-80 place-items-center rounded-2xl bg-navy-900 p-8 text-white">
          <div className="flex h-64 w-48 flex-col justify-between rounded-r-md border-l-8 border-gold-400 bg-blue-800 p-5 shadow-xl">
            <BookOpen size={24} className="text-gold-300" />
            <strong className="font-serif text-2xl leading-tight">{book.title}</strong>
            <span className="text-xs text-blue-100">{book.authorName || 'Kisii University Library'}</span>
          </div>
        </div>
        <section>
          <p className="text-xs font-semibold uppercase tracking-[.15em] text-blue-700">{book.categoryName || 'Library collection'}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold text-navy-900">{book.title}</h1>
          <p className="mt-3 text-lg text-slate-600">{book.authorName || 'Author not listed'}</p>
          <p className="mt-6 whitespace-pre-line text-sm leading-7 text-slate-600">{book.description || 'No description is available for this title.'}</p>
          <dl className="mt-7 grid grid-cols-2 gap-4 border-y border-slate-200 py-5 text-sm">
            <div><dt className="text-xs text-slate-500">ISBN</dt><dd className="mt-1 font-medium text-slate-800">{book.isbn || 'Not listed'}</dd></div>
            <div><dt className="text-xs text-slate-500">Availability</dt><dd className="mt-1 flex items-center gap-1.5 font-medium text-emerald-700"><CheckCircle2 size={15} />{book.availableCopies} of {book.totalCopies} copies</dd></div>
          </dl>
          <div className="mt-5 flex flex-wrap gap-3">
            {book.availableCopies > 0
              ? <button className="btn btn-primary px-5 py-3" disabled={working} onClick={() => performAction('borrow')}>Borrow book</button>
              : <button className="btn btn-primary px-5 py-3" disabled={working} onClick={() => performAction('reserve')}>Reserve title</button>}
            <Link to="/assistant" className="btn btn-outline px-5 py-3">Ask the library assistant</Link>
          </div>
        </section>
      </div>
      <section className="mt-12">
        <div className="mb-4 flex items-center gap-2"><BookCopy size={18} className="text-blue-700" /><h2 className="font-serif text-xl font-semibold text-navy-900">Physical copies</h2></div>
        {copiesError ? <ErrorState message={copiesError} retry={load} /> : copies.length ? <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Barcode</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Condition notes</th></tr></thead><tbody>{copies.map((copy) => <tr key={recordId(copy)} className="border-t border-slate-100"><td className="px-4 py-3 font-medium">{copy.barcode || '—'}</td><td className="px-4 py-3">{copy.status}</td><td className="px-4 py-3 text-slate-500">{copy.conditionNote || '—'}</td></tr>)}</tbody></table></div> : <EmptyState title="Copy-level details are not recorded">Availability for this title is tracked by aggregate inventory.</EmptyState>}
      </section>
    </div>
  )
}
