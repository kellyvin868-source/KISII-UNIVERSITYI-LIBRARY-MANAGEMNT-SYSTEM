import { ArrowUpRight, BookOpen, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { recordId } from '../utils/records'

const colors = ['bg-blue-900', 'bg-amber-800', 'bg-slate-700', 'bg-emerald-800', 'bg-indigo-900']

export default function BookCard({ book, index = 0 }) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/books/${recordId(book)}`} className={`relative flex h-44 flex-col justify-between overflow-hidden p-5 text-white ${colors[index % colors.length]}`}>
        <span className="absolute -bottom-12 -right-7 size-40 rounded-full border border-white/20" />
        <span className="relative text-[9px] font-semibold uppercase tracking-[.16em] text-white/75">{book.categoryName || 'Library collection'}</span>
        <BookOpen className="absolute right-5 top-6 text-white/45" size={22} />
        <strong className="relative max-w-[85%] font-serif text-xl leading-snug">{book.title}</strong>
        <span className="relative text-xs text-white/80">{book.authorName || 'Author not listed'}</span>
      </Link>
      <div className="p-4">
        <div className="flex items-center justify-between gap-3">
          <span className={`inline-flex items-center gap-1.5 text-xs ${book.availableCopies > 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
            <CheckCircle2 size={14} />{book.availableCopies > 0 ? `${book.availableCopies} available` : 'Currently out'}
          </span>
          <Link to={`/books/${recordId(book)}`} className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">Details <ArrowUpRight size={14} /></Link>
        </div>
        {book.isbn && <p className="mt-2 text-[10px] text-slate-500">ISBN {book.isbn}</p>}
      </div>
    </article>
  )
}
