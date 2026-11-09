import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis
} from 'recharts'
import { Activity, BookCopy, BookOpen, Bot, Clock3, CreditCard, Mail, Plus, RefreshCw, Users, Wallet } from 'lucide-react'
import { apiErrorMessage } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { useNotifications } from '../contexts/NotificationContext'
import { getDemandForecast, suggestBookCategories } from '../services/aiService'
import { createAuthor, createBook, createBookCopy, createCategory, listAuthors, listBooks, listCategories } from '../services/booksService'
import { calculateFine, listFines } from '../services/finesService'
import { listLoans, borrowBook, returnLoan } from '../services/loansService'
import { listMembers, registerMember, updateMember } from '../services/membersService'
import { listPayments } from '../services/paymentsService'
import { listNotifications, sendEmailNotification, sendSmsNotification } from '../services/notificationsService'
import { cancelReservation, listReservations } from '../services/reservationsService'
import { useAuth } from '../contexts/AuthContext'
import { recordId } from '../utils/records'

const staffTabs = [
  ['overview', 'Overview'], ['catalog', 'Catalog'], ['circulation', 'Circulation'],
  ['members', 'Members'], ['reservations', 'Reservations'], ['finance', 'Fines & payments'],
  ['notifications', 'Notifications'], ['insights', 'AI insights']
]
const date = (value) => value ? new Date(value).toLocaleDateString() : '—'
const money = (value) => `KSh ${Number(value || 0).toLocaleString()}`
const chartColors = ['#102a43', '#2563eb', '#d4a017', '#16a34a', '#64748b']

export default function StaffPage() {
  const { member } = useAuth()
  const { notify } = useNotifications()
  const [activeTab, setActiveTab] = useState('overview')
  const [lookups, setLookups] = useState({ authors: [], categories: [], books: [], members: [] })
  const [inventoryTotal, setInventoryTotal] = useState(0)
  const [memberTotal, setMemberTotal] = useState(0)
  const [data, setData] = useState({ loans: [], reservations: [], fines: [], payments: [], notifications: [], forecast: [] })
  const [bookQuery, setBookQuery] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState('')
  const [copyBookId, setCopyBookId] = useState('')

  const loadWorkspace = useCallback(async (showLoading = true) => {
    if (showLoading) setBusy(true)
    try {
      const [
        authors, categories, books, members, loans, reservations, fines, payments, notifications
      ] = await Promise.all([
        listAuthors(), listCategories(), listBooks({ limit: 100 }), listMembers({ limit: 100, page: 1 }),
        listLoans(), listReservations(), listFines(), listPayments(), listNotifications()
      ])
      setError('')
      setLookups({
        authors, categories, books: books.data || [],
        members: members.data || []
      })
      setInventoryTotal(books.total || 0)
      setMemberTotal(members.meta?.total || members.data?.length || 0)
      setData((current) => ({ ...current, loans, reservations, fines, payments, notifications }))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }, [])

  // The initial request owns async loading/error state updates after its network calls.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadWorkspace(false) }, [loadWorkspace])
  useEffect(() => {
    if (activeTab !== 'insights' && activeTab !== 'overview') return
    getDemandForecast()
      .then((result) => setData((current) => ({ ...current, forecast: result.forecasts || [] })))
      .catch((requestError) => setError(apiErrorMessage(requestError)))
  }, [activeTab])

  const activeLoans = useMemo(() => data.loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status)), [data.loans])
  const overdueLoans = useMemo(() => data.loans.filter((loan) => loan.status === 'OVERDUE'), [data.loans])
  const activeReservations = useMemo(() => data.reservations.filter((item) => ['WAITING', 'READY'].includes(item.status)), [data.reservations])
  const outstandingFine = useMemo(() => data.fines.filter((fine) => fine.status !== 'PAID').reduce((sum, fine) => sum + fine.amount - fine.paidAmount, 0), [data.fines])
  const chartData = useMemo(() => data.forecast.slice(0, 7).map((book) => ({
    title: (book.title || 'Untitled').length > 18 ? `${book.title.slice(0, 17)}…` : (book.title || 'Untitled'),
    borrows: book.borrowingCountLast180Days
  })), [data.forecast])
  const circulationData = [
    { name: 'Active', value: activeLoans.filter((loan) => loan.status === 'ACTIVE').length },
    { name: 'Overdue', value: overdueLoans.length },
    { name: 'Returned', value: data.loans.filter((loan) => loan.status === 'RETURNED').length }
  ].filter((item) => item.value > 0)

  async function act(key, operation, successMessage) {
    setActionId(key)
    try {
      await operation()
      notify(successMessage)
      await loadWorkspace()
      return true
    } catch (requestError) {
      notify(apiErrorMessage(requestError), 'error')
      return false
    } finally {
      setActionId('')
    }
  }

  async function addLookup(kind) {
    const name = window.prompt(`Enter ${kind} name`)
    if (!name?.trim()) return
    await act(`lookup-${kind}`, async () => {
      if (kind === 'author') {
        const author = await createAuthor(name.trim())
        setLookups((current) => ({ ...current, authors: [...current.authors, author.data || author].sort((a, b) => a.name.localeCompare(b.name)) }))
      } else {
        const category = await createCategory(name.trim())
        setLookups((current) => ({ ...current, categories: [...current.categories, category.data || category].sort((a, b) => a.name.localeCompare(b.name)) }))
      }
    }, `${kind} added.`)
  }

  async function submitBook(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    const { copyBarcodes, ...bookFields } = values
    const barcodes = String(copyBarcodes || '').split(',').map((item) => item.trim()).filter(Boolean)
    const payload = { ...bookFields, totalCopies: Number(values.totalCopies) }
    if (barcodes.length) payload.copyBarcodes = barcodes
    if (await act('new-book', () => createBook(payload), 'Book added to the catalog.')) form.reset()
  }

  async function submitCheckout(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    if (await act(`checkout-${values.memberId}-${values.bookId}`, () => borrowBook(values.memberId, values.bookId), 'Checkout recorded.')) form.reset()
  }

  async function submitRegistration(event) {
    event.preventDefault()
    const form = event.currentTarget
    const values = Object.fromEntries(new FormData(form).entries())
    if (await act('register-member', () => registerMember(values), 'Member registered.')) form.reset()
  }

  async function submitCopy(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    if (await act('add-copy', () => createBookCopy(values.bookId, values.barcode), 'Book copy added.')) event.currentTarget.reset()
  }

  async function updateRole(memberId, role) {
    await act(memberId, () => updateMember(memberId, { role }), 'Member role updated.')
  }

  async function notifyByEmail(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    if (await act('email-notice', () => sendEmailNotification(values), 'Email notification queued.')) event.currentTarget.reset()
  }

  async function notifyBySms(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    if (await act('sms-notice', () => sendSmsNotification(values), 'SMS notification queued.')) event.currentTarget.reset()
  }

  async function categorize(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    await act('categorize', async () => {
      const response = await suggestBookCategories(values)
      notify(`Suggested categories: ${response.suggestions.map((item) => item.name).join(', ') || 'No category suggestions returned.'}`)
    }, 'Category suggestions received.')
  }

  const filteredBooks = lookups.books.filter((book) => (
    `${book.title} ${book.authorName} ${book.isbn}`.toLowerCase().includes(bookQuery.toLowerCase())
  ))

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">Staff workspace</p><h1 className="mt-2 font-serif text-3xl font-semibold text-navy-900">Library operations</h1><p className="mt-1 text-sm text-slate-500">Welcome, {member.fname}. Manage circulation, inventory, and member services.</p></div>
        <button className="btn btn-outline" onClick={loadWorkspace} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Refresh data</button>
      </header>
      {error && <div className="mb-5"><ErrorState message={error} retry={loadWorkspace} /></div>}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200">
        {staffTabs.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`shrink-0 border-b-2 px-3 py-3 text-xs font-medium ${activeTab === id ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
      </div>
      {busy && activeTab !== 'insights' ? <LoadingState label="Loading library operations…" /> : (
        <>
          {activeTab === 'overview' && <Overview inventoryTotal={inventoryTotal} memberTotal={memberTotal} data={data} activeLoans={activeLoans} overdueLoans={overdueLoans} activeReservations={activeReservations} outstandingFine={outstandingFine} chartData={chartData} circulationData={circulationData} />}
          {activeTab === 'catalog' && <CatalogManagement books={filteredBooks} query={bookQuery} setQuery={setBookQuery} authors={lookups.authors} categories={lookups.categories} onAddLookup={addLookup} onSubmitBook={submitBook} onSubmitCopy={submitCopy} copyBookId={copyBookId} setCopyBookId={setCopyBookId} actionId={actionId} />}
          {activeTab === 'circulation' && <Circulation loans={activeLoans} members={lookups.members} books={lookups.books} actionId={actionId} onSubmitCheckout={submitCheckout} onReturn={(loan) => act(recordId(loan), () => returnLoan(recordId(loan)), 'Book return recorded.')} onFine={(loan) => act(recordId(loan), () => calculateFine(recordId(loan)), 'Fine calculation completed.')} />}
          {activeTab === 'members' && <MembersTable members={lookups.members} admin={member.role === 'ADMIN'} actionId={actionId} onRoleChange={updateRole} onRegister={submitRegistration} />}
          {activeTab === 'reservations' && <ReservationsTable reservations={data.reservations} actionId={actionId} onCancel={(item) => act(recordId(item), () => cancelReservation(recordId(item)), 'Reservation cancelled.')} />}
          {activeTab === 'finance' && <Finance data={data} />}
          {activeTab === 'notifications' && <Notifications data={data.notifications} onEmail={notifyByEmail} onSms={notifyBySms} />}
          {activeTab === 'insights' && <Insights chartData={chartData} onCategorize={categorize} />}
        </>
      )}
    </div>
  )
}

function Overview({ inventoryTotal, memberTotal, data, activeLoans, overdueLoans, activeReservations, outstandingFine, chartData, circulationData }) {
  const metrics = [
    { label: 'Catalog titles', value: inventoryTotal, icon: BookOpen },
    { label: 'Registered members', value: memberTotal, icon: Users },
    { label: 'Active loans', value: activeLoans.length, icon: BookCopy },
    { label: 'Overdue loans', value: overdueLoans.length, icon: Activity },
    { label: 'Pending reservations', value: activeReservations.length, icon: Clock3 },
    { label: 'Outstanding fines', value: money(outstandingFine), icon: Wallet }
  ]
  return <div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{metrics.map(({ label, value, icon: Icon }) => <article key={label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between text-xs text-slate-500">{label}<Icon size={16} className="text-blue-700" /></div><p className="mt-3 text-2xl font-semibold text-navy-900">{value}</p></article>)}</div><div className="mt-5 grid gap-5 lg:grid-cols-2"><ChartPanel title="Most borrowed titles · last 180 days">{chartData.length ? <ResponsiveContainer width="100%" height={260}><BarChart data={chartData} margin={{ left: 0, right: 12, top: 8 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="title" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="borrows" fill="#2563eb" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No borrowing forecast data">The API has no recent borrowing records to chart.</EmptyState>}</ChartPanel><ChartPanel title="Loan status breakdown">{circulationData.length ? <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={circulationData} dataKey="value" nameKey="name" outerRadius={88} label>{circulationData.map((item, index) => <Cell key={item.name} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer> : <EmptyState title="No loan activity">Loan statistics appear when records are available.</EmptyState>}</ChartPanel></div><p className="mt-4 text-[11px] text-slate-400">Counts reflect the API responses available to this staff account; no sample figures are used. {data.payments.length} payment records loaded.</p></div>
}

function ChartPanel({ title, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-serif text-lg font-semibold text-navy-900">{title}</h2>{children}</section>
}

function CatalogManagement({ books, query, setQuery, authors, categories, onAddLookup, onSubmitBook, onSubmitCopy, copyBookId, setCopyBookId, actionId }) {
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-lg font-semibold text-navy-900">Add a catalog title</h2><div className="flex gap-2"><button className="btn btn-outline px-3 py-2" onClick={() => onAddLookup('author')}><Plus size={14} /> Author</button><button className="btn btn-outline px-3 py-2" onClick={() => onAddLookup('category')}><Plus size={14} /> Category</button></div></div><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onSubmitBook}><Field label="Title"><input className="form-control" name="title" required maxLength={300} /></Field><Field label="ISBN"><input className="form-control" name="isbn" required maxLength={20} /></Field><Field label="Author"><select className="form-control" name="authorId" required defaultValue=""><option value="" disabled>Select author</option>{authors.map((item) => <option value={recordId(item)} key={recordId(item)}>{item.name}</option>)}</select></Field><Field label="Category"><select className="form-control" name="categoryId" required defaultValue=""><option value="" disabled>Select category</option>{categories.map((item) => <option value={recordId(item)} key={recordId(item)}>{item.name}</option>)}</select></Field><Field label="Total copies"><input className="form-control" type="number" name="totalCopies" min="0" defaultValue="1" required /></Field><Field label="Description"><input className="form-control" name="description" maxLength={5000} /></Field><Field label="Copy barcodes (comma separated)"><input className="form-control" name="copyBarcodes" placeholder="Optional" /></Field><div className="flex items-end"><button className="btn btn-primary px-4 py-2.5" disabled={actionId === 'new-book'}>Save book</button></div></form></section><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-lg font-semibold text-navy-900">Catalog inventory</h2><input className="form-control max-w-xs" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter loaded titles…" /></div>{books.length ? <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Title</th><th className="px-3 py-3">ISBN</th><th className="px-3 py-3">Available</th><th className="px-3 py-3">Total</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>{books.map((book) => <tr key={recordId(book)} className="border-t border-slate-100"><td className="px-3 py-3 font-medium">{book.title}<span className="block text-slate-500">{book.authorName}</span></td><td className="px-3 py-3">{book.isbn}</td><td className="px-3 py-3">{book.availableCopies}</td><td className="px-3 py-3">{book.totalCopies}</td><td className="px-3 py-3"><button className="text-blue-700 underline" onClick={() => setCopyBookId(recordId(book))}>Add copy</button></td></tr>)}</tbody></table></div> : <EmptyState title="No catalog titles">Create a title above or adjust the filter.</EmptyState>}</section>{copyBookId && <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-3 flex justify-between"><h2 className="font-serif text-lg font-semibold text-navy-900">Add physical copy</h2><button className="text-xs text-slate-500" onClick={() => setCopyBookId('')}>Close</button></div><form className="flex max-w-lg flex-wrap items-end gap-3" onSubmit={onSubmitCopy}><input type="hidden" name="bookId" value={copyBookId} /><Field label="Barcode (optional)"><input className="form-control" name="barcode" maxLength={100} /></Field><button className="btn btn-primary" disabled={actionId === 'add-copy'}>Add copy</button></form></section>}</div>
}

function Circulation({ loans, members, books, actionId, onSubmitCheckout, onReturn, onFine }) {
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-serif text-lg font-semibold text-navy-900">Issue a book</h2><form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]" onSubmit={onSubmitCheckout}><Field label="Member"><select className="form-control" name="memberId" defaultValue="" required><option value="" disabled>Select member</option>{members.map((item) => <option key={recordId(item)} value={recordId(item)}>{item.fname} {item.lname} · {item.regNo || item.email}</option>)}</select></Field><Field label="Book"><select className="form-control" name="bookId" defaultValue="" required><option value="" disabled>Select available title</option>{books.filter((book) => book.availableCopies > 0).map((item) => <option key={recordId(item)} value={recordId(item)}>{item.title} ({item.availableCopies})</option>)}</select></Field><button className="btn btn-primary self-end" disabled={actionId.startsWith('checkout-')}>Issue book</button></form></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-serif text-lg font-semibold text-navy-900">Active and overdue loans</h2>{loans.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Title / member</th><th className="px-3 py-3">Barcode</th><th className="px-3 py-3">Due date</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Actions</th></tr></thead><tbody>{loans.map((loan) => <tr className="border-t border-slate-100" key={recordId(loan)}><td className="px-3 py-3 font-medium">{loan.bookId?.title || 'Book'}<span className="block text-slate-500">{loan.memberId?.fname || 'Member'} {loan.memberId?.lname || String(loan.memberId?.id || loan.memberId?._id || loan.memberId).slice(-8)}</span></td><td className="px-3 py-3">{loan.copyId?.barcode || '—'}</td><td className="px-3 py-3">{date(loan.dueDate)}</td><td className="px-3 py-3">{loan.status}</td><td className="flex gap-3 px-3 py-3"><button className="font-semibold text-blue-700" disabled={actionId === recordId(loan)} onClick={() => onReturn(loan)}>Return</button><button className="font-semibold text-amber-700" disabled={actionId === recordId(loan)} onClick={() => onFine(loan)}>Calculate fine</button></td></tr>)}</tbody></table></div> : <EmptyState title="No active loans">Checkouts will appear here.</EmptyState>}</section></div>
}

function MembersTable({ members, admin, actionId, onRoleChange, onRegister }) {
  return <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-serif text-lg font-semibold text-navy-900">Register a member</h2><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={onRegister}>{[['fname','First name'],['lname','Last name'],['email','Email'],['regNo','Registration number'],['phone','Phone'],['password','Temporary password']].map(([name,label]) => <Field label={label} key={name}><input className="form-control" name={name} type={name === 'password' ? 'password' : name === 'email' ? 'email' : 'text'} minLength={name === 'password' ? 8 : undefined} required={name !== 'phone'} /></Field>)}<button className="btn btn-primary self-end" type="submit">Register member</button></form></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-serif text-lg font-semibold text-navy-900">Member directory</h2>{members.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Member</th><th className="px-3 py-3">Registration</th><th className="px-3 py-3">Enrollment</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th></tr></thead><tbody>{members.map((item) => <tr className="border-t border-slate-100" key={recordId(item)}><td className="px-3 py-3 font-medium">{item.fname} {item.lname}<span className="block text-slate-500">{item.email}</span></td><td className="px-3 py-3">{item.regNo || '—'}</td><td className="px-3 py-3">{item.enrollmentStatus}</td><td className="px-3 py-3">{admin ? <select className="form-control max-w-36" value={item.role} disabled={actionId === recordId(item)} onChange={(event) => onRoleChange(recordId(item), event.target.value)}><option>MEMBER</option><option>LIBRARIAN</option><option>ADMIN</option></select> : item.role}</td><td className="px-3 py-3">{item.status}</td></tr>)}</tbody></table></div> : <EmptyState title="No members found">Member profiles are returned by the API.</EmptyState>}</section></div>
}

function ReservationsTable({ reservations, actionId, onCancel }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-serif text-lg font-semibold text-navy-900">Reservation queue</h2>{reservations.length ? reservations.map((item) => <div key={recordId(item)} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="text-sm font-semibold">{item.bookId?.title || 'Book'} · {item.status}</p><p className="mt-1 text-xs text-slate-500">Member {String(item.memberId?.id || item.memberId?._id || item.memberId).slice(-8)} · {item.status === 'READY' ? `Hold expires ${date(item.expiresAt)}` : `Queue #${item.queuePosition || '—'}`}</p></div>{['WAITING','READY'].includes(item.status) && <button className="text-xs font-semibold text-red-700" disabled={actionId === recordId(item)} onClick={() => onCancel(item)}>Cancel reservation</button>}</div>) : <EmptyState title="No reservations">Reservation records will appear here.</EmptyState>}</section>
}

function Finance({ data }) {
  return <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-3 flex items-center gap-2"><Wallet size={17} className="text-blue-700" /><h2 className="font-serif text-lg font-semibold text-navy-900">Fines</h2></div>{data.fines.length ? data.fines.map((fine) => <div key={recordId(fine)} className="flex justify-between gap-3 border-b border-slate-100 py-3 text-xs last:border-0"><span>{fine.reason} · {fine.status}<small className="block mt-1 text-slate-500">{String(fine.memberId?.id || fine.memberId?._id || fine.memberId).slice(-8)} · {fine.description}</small></span><strong>{money(fine.amount - fine.paidAmount)}</strong></div>) : <EmptyState title="No fines recorded">Fine records will appear here.</EmptyState>}</section><section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-3 flex items-center gap-2"><CreditCard size={17} className="text-blue-700" /><h2 className="font-serif text-lg font-semibold text-navy-900">Payments</h2></div>{data.payments.length ? data.payments.map((payment) => <div key={recordId(payment)} className="flex justify-between gap-3 border-b border-slate-100 py-3 text-xs last:border-0"><span>{payment.status}<small className="block mt-1 text-slate-500">{payment.providerReceipt || payment.failureReason || date(payment.createdAt)}</small></span><strong>{money(payment.amount)}</strong></div>) : <EmptyState title="No payment records">Payment history will appear here.</EmptyState>}</section></div>
}

function Notifications({ data, onEmail, onSms }) {
  return <div className="space-y-5"><div className="grid gap-5 lg:grid-cols-2"><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 font-serif text-lg font-semibold text-navy-900"><Mail size={17} /> Send email</h2><form className="space-y-3" onSubmit={onEmail}><Field label="Recipient"><input className="form-control" name="recipient" type="email" required /></Field><Field label="Subject"><input className="form-control" name="subject" required /></Field><Field label="Message"><textarea className="form-control min-h-24" name="body" maxLength={5000} required /></Field><button className="btn btn-primary">Queue email</button></form></section><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 font-serif text-lg font-semibold text-navy-900">Send SMS</h2><form className="space-y-3" onSubmit={onSms}><Field label="International phone number"><input className="form-control" name="phoneNumber" type="tel" placeholder="+2547…" required /></Field><Field label="Message"><textarea className="form-control min-h-24" name="message" maxLength={5000} required /></Field><button className="btn btn-primary">Queue SMS</button></form></section></div><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-serif text-lg font-semibold text-navy-900">Notification queue</h2>{data.length ? data.map((item) => <div key={recordId(item)} className="flex justify-between gap-3 border-b border-slate-100 py-3 text-xs last:border-0"><span>{item.channel} · {item.recipient}<small className="block mt-1 text-slate-500">{item.subject || item.eventType}</small></span><strong>{item.status}</strong></div>) : <EmptyState title="No notification activity">Notifications appear when queued by staff or circulation events.</EmptyState>}</section></div>
}

function Insights({ chartData, onCategorize }) {
  return <div className="grid gap-5 lg:grid-cols-2"><ChartPanel title="Historical demand · last 180 days">{chartData.length ? <ResponsiveContainer width="100%" height={300}><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="title" tick={{ fontSize: 9 }} /><YAxis allowDecimals={false} tick={{ fontSize: 10 }} /><Tooltip /><Bar dataKey="borrows" fill="#2563eb" radius={[4,4,0,0]} /></BarChart></ResponsiveContainer> : <EmptyState title="No demand data">The API returned no titles with recent borrowings.</EmptyState>}</ChartPanel><section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 flex items-center gap-2 font-serif text-lg font-semibold text-navy-900"><Bot size={18} className="text-blue-700" />AI category suggestions</h2><form className="space-y-3" onSubmit={onCategorize}><Field label="Book title"><input className="form-control" name="title" maxLength={300} required /></Field><Field label="Description or summary"><textarea className="form-control min-h-28" name="description" maxLength={5000} required /></Field><button className="btn btn-primary">Suggest categories</button></form></section><p className="text-xs text-slate-500 lg:col-span-2">Demand figures are derived from real borrowing history by the API. Suggestions require an available AI provider and are not saved automatically.</p></div>
}

function Field({ label, children }) {
  return <label className="block space-y-1.5 text-xs font-medium text-slate-700">{label}{children}</label>
}
