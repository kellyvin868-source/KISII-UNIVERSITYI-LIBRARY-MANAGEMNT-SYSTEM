import { useEffect, useState } from 'react'
import { BookOpen, Filter, Search, Sparkles } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import BookCard from '../components/BookCard'
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { listAuthors, listBooks, listCategories, smartSearch } from '../services/booksService'
import { recordId } from '../utils/records'

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [query, setQuery] = useState(searchParams.get('query') || '')
  const [categoryId, setCategoryId] = useState('')
  const [authorId, setAuthorId] = useState('')
  const [availability, setAvailability] = useState('')
  const [isSmart, setIsSmart] = useState(false)
  const [books, setBooks] = useState([])
  const [categories, setCategories] = useState([])
  const [authors, setAuthors] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [lookupAttempt, setLookupAttempt] = useState(0)

  useEffect(() => {
    Promise.all([listCategories(), listAuthors()])
      .then(([categoryList, authorList]) => {
        setCategories(categoryList)
        setAuthors(authorList)
        setLookupError('')
      })
      .catch((requestError) => {
        setCategories([])
        setAuthors([])
        setLookupError(requestError.response?.data?.message || requestError.message)
      })
  }, [lookupAttempt])

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      setBusy(true)
      setError('')
      try {
        if (isSmart && query.trim()) {
          const result = await smartSearch(query.trim())
          let matches = result.books || []
          if (categoryId) matches = matches.filter((book) => (book.categoryId?._id || book.categoryId) === categoryId)
          if (authorId) matches = matches.filter((book) => (book.authorId?._id || book.authorId) === authorId)
          if (availability) matches = matches.filter((book) => availability === 'available' ? book.availableCopies > 0 : book.availableCopies === 0)
          setBooks(matches)
          setTotal(matches.length)
        } else {
          const result = await listBooks({
            ...(query.trim() ? { query: query.trim() } : {}),
            ...(categoryId ? { categoryId } : {}),
            ...(authorId ? { authorId } : {}),
            ...(availability ? { available: availability === 'available' } : {}),
            page,
            limit: 12
          })
          setBooks(result.data || [])
          setTotal(result.total || 0)
        }
      } catch (requestError) {
        setError(requestError.response?.data?.message || requestError.message)
      } finally {
        setBusy(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [query, categoryId, authorId, availability, page, isSmart])

  function updateQuery(event) {
    event.preventDefault()
    const next = new URLSearchParams(searchParams)
    if (query.trim()) next.set('query', query.trim())
    else next.delete('query')
    setSearchParams(next, { replace: true })
    setPage(1)
  }

  return (
    <div>
      <section className="relative overflow-hidden bg-navy-900 text-white">
        <div className="absolute -right-20 -top-32 size-[450px] rounded-full border border-white/10" />
        <div className="absolute -right-6 -top-16 size-[330px] rounded-full border border-white/10" />
        <div className="relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_.8fr] lg:px-8 lg:py-20">
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[.2em] text-gold-300">Kisii University Library</p>
            <h1 className="max-w-2xl font-serif text-5xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">Knowledge for<br /><span className="text-gold-300">every journey.</span></h1>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-200">Explore the library collection, discover research resources, and find your next great read.</p>
            <form onSubmit={updateQuery} className="mt-8 flex max-w-2xl items-center gap-2 rounded-lg bg-white p-2 text-slate-500 shadow-lg">
              <Search size={19} className="ml-2 shrink-0" />
              <input aria-label="Search books" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1) }} placeholder="Search title, author, ISBN…" className="min-w-0 flex-1 border-0 px-1 py-2 text-sm text-slate-800 outline-none" />
              <button className="btn btn-primary px-4 py-2.5">Search</button>
            </form>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 text-xs text-slate-200">
              <input className="accent-gold-400" type="checkbox" checked={isSmart} onChange={(event) => setIsSmart(event.target.checked)} />
              <Sparkles size={14} className="text-gold-300" /> Use AI smart search for natural-language queries
            </label>
          </div>
          <div className="hidden justify-self-end lg:block">
            <div className="relative flex h-72 w-72 items-center justify-center rounded-full bg-blue-800/60">
              <div className="absolute size-56 rounded-full border border-gold-300/50" />
              <div className="absolute size-44 rounded-full border border-white/20" />
              <div className="relative grid h-48 w-36 place-items-center rounded-r-md rounded-l-sm border-l-[10px] border-gold-300 bg-blue-700 shadow-2xl">
                <BookOpen className="text-gold-200" size={54} strokeWidth={1} />
                <span className="absolute bottom-5 text-[8px] uppercase tracking-[.2em] text-white/70">Kisii University</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">The collection</p><h2 className="mt-2 font-serif text-3xl font-semibold text-navy-900">{query ? 'Search results' : 'Explore books'}</h2></div>
          <p className="text-xs text-slate-500">{total.toLocaleString()} {total === 1 ? 'title' : 'titles'}</p>
        </div>
        <div className="mb-6 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[auto_1fr_1fr_1fr] lg:items-center">
          <span className="flex items-center gap-2 text-xs font-semibold text-slate-700"><Filter size={15} /> Filter results</span>
          <select className="form-control" aria-label="Filter by category" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1) }}><option value="">All categories</option>{categories.map((category) => <option key={category._id || category.id} value={category._id || category.id}>{category.name}</option>)}</select>
          <select className="form-control" aria-label="Filter by author" value={authorId} onChange={(event) => { setAuthorId(event.target.value); setPage(1) }}><option value="">All authors</option>{authors.map((author) => <option key={author._id || author.id} value={author._id || author.id}>{author.name}</option>)}</select>
          <select className="form-control" aria-label="Filter by availability" value={availability} onChange={(event) => { setAvailability(event.target.value); setPage(1) }}><option value="">Any availability</option><option value="available">Available</option><option value="unavailable">Unavailable</option></select>
        </div>
        {lookupError && <div className="mb-5"><ErrorState message={lookupError} retry={() => setLookupAttempt((attempt) => attempt + 1)} /></div>}
        {error && <div className="mb-5"><ErrorState message={error} retry={() => setPage((value) => value)} /></div>}
        {busy ? <LoadingState label="Loading the catalog…" /> : books.length ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{books.map((book, index) => <BookCard key={recordId(book)} book={book} index={index} />)}</div>
            {!isSmart && total > 12 && <div className="mt-8 flex items-center justify-center gap-4"><button className="btn btn-outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button><span className="text-xs text-slate-600">Page {page} of {Math.ceil(total / 12)}</span><button className="btn btn-outline" disabled={page >= Math.ceil(total / 12)} onClick={() => setPage((value) => value + 1)}>Next</button></div>}
          </>
        ) : <EmptyState title="No books found">Adjust the filters or try a different search.</EmptyState>}
      </section>
    </div>
  )
}
