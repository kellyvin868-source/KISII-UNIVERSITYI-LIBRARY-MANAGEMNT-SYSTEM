import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, Clock3, CreditCard, IdCard, RefreshCw, ShieldCheck, Wallet } from 'lucide-react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { apiErrorMessage } from '../api/client'
import { EmptyState, ErrorState, LoadingState } from '../components/Feedback'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { getRecommendations } from '../services/aiService'
import { listFines } from '../services/finesService'
import { listLoans, renewLoan } from '../services/loansService'
import { getBorrowingHistory, updateMember, verifyStudent } from '../services/membersService'
import { initiateMpesaPayment, listPayments } from '../services/paymentsService'
import { cancelReservation, listReservations } from '../services/reservationsService'
import BookCard from '../components/BookCard'
import { recordId } from '../utils/records'

const tabs = [
  ['overview', 'Overview'], ['loans', 'My loans'], ['history', 'History'],
  ['reservations', 'Reservations'], ['fines', 'Fines'], ['payments', 'Payments'],
  ['recommendations', 'Recommendations'], ['profile', 'My profile']
]
const date = (value) => value ? new Date(value).toLocaleDateString() : '—'
const money = (value) => `KSh ${Number(value || 0).toLocaleString()}`
const profileSchema = z.object({
  fname: z.string().trim().min(1, 'First name is required.'),
  lname: z.string().trim().min(1, 'Last name is required.'),
  email: z.string().email('Enter a valid email address.'),
  phone: z.string().optional(),
  regNo: z.string().optional()
})

export default function AccountPage() {
  const { member, refreshMember } = useAuth()
  const { notify } = useNotifications()
  const [activeTab, setActiveTab] = useState('overview')
  const [data, setData] = useState({ loans: [], history: [], reservations: [], fines: [], payments: [], recommendations: [] })
  const [phone, setPhone] = useState(member?.phone || '')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [actionId, setActionId] = useState('')
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fname: member?.fname || '', lname: member?.lname || '', email: member?.email || '',
      phone: member?.phone || '', regNo: member?.regNo || ''
    }
  })

  const loadAccount = useCallback(async (showLoading = true) => {
    if (showLoading) setBusy(true)
    try {
      const [loans, history, reservations, fines, payments] = await Promise.all([
        listLoans(), getBorrowingHistory(member.id), listReservations(), listFines(), listPayments()
      ])
      setError('')
      setData((current) => ({ ...current, loans, history, reservations, fines, payments }))
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    } finally {
      setBusy(false)
    }
  }, [member.id])

  // The initial request owns async loading/error state updates after its network calls.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadAccount(false) }, [loadAccount])
  useEffect(() => {
    if (activeTab !== 'recommendations') return
    getRecommendations(member.id)
      .then((result) => setData((current) => ({ ...current, recommendations: result.recommendations || [] })))
      .catch((requestError) => setError(apiErrorMessage(requestError)))
  }, [activeTab, member.id])
  useEffect(() => {
    reset({
      fname: member?.fname || '', lname: member?.lname || '', email: member?.email || '',
      phone: member?.phone || '', regNo: member?.regNo || ''
    })
  }, [member, reset])

  const outstanding = useMemo(() => data.fines.filter((fine) => fine.status !== 'PAID'), [data.fines])
  const activeLoans = useMemo(() => data.loans.filter((loan) => ['ACTIVE', 'OVERDUE'].includes(loan.status)), [data.loans])

  async function runAction(id, operation, successMessage) {
    setActionId(id)
    try {
      await operation()
      notify(successMessage)
      await loadAccount()
    } catch (requestError) {
      notify(apiErrorMessage(requestError), 'error')
    } finally {
      setActionId('')
    }
  }

  async function pay(fine) {
    const id = recordId(fine)
    await runAction(id, () => initiateMpesaPayment({
      fineId: id,
      amount: Math.ceil(fine.amount - fine.paidAmount),
      phoneNumber: phone
    }), 'M-Pesa prompt sent. Approve the payment on your phone.')
  }

  async function saveProfile(values) {
    try {
      const updates = { ...values }
      if (!updates.phone?.trim()) delete updates.phone
      if (!updates.regNo?.trim()) delete updates.regNo
      await updateMember(member.id, updates)
      await refreshMember()
      notify('Profile updated.')
    } catch (requestError) {
      notify(apiErrorMessage(requestError), 'error')
    }
  }

  async function verifyEnrollment() {
    try {
      if (!member.regNo) throw new Error('Add your university registration number to your profile first.')
      const result = await verifyStudent(member.regNo)
      await refreshMember()
      notify(result.verified ? 'Student enrollment verified.' : 'The registry did not confirm active enrollment.', result.verified ? 'success' : 'error')
    } catch (requestError) {
      notify(apiErrorMessage(requestError), 'error')
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">Member portal</p><h1 className="mt-2 font-serif text-3xl font-semibold text-navy-900">Welcome, {member.fname}.</h1><p className="mt-1 text-sm text-slate-500">Manage your library activity and account.</p></div>
        <button className="btn btn-outline" onClick={loadAccount} disabled={busy}><RefreshCw size={15} className={busy ? 'animate-spin' : ''} /> Refresh</button>
      </header>
      {member.role === 'MEMBER' && member.memberType === 'STUDENT' && member.enrollmentStatus !== 'VERIFIED' && (
        <section className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3"><ShieldCheck size={20} className="mt-0.5 text-amber-700" /><div><p className="text-sm font-semibold text-amber-950">Verify your student enrollment</p><p className="mt-1 text-xs text-amber-800">Active student verification is required before borrowing.</p></div></div>
          <button className="btn btn-primary px-4 py-2" onClick={verifyEnrollment}>Verify now <ArrowRight size={14} /></button>
        </section>
      )}
      {error && <div className="mb-5"><ErrorState message={error} retry={loadAccount} /></div>}
      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px">
        {tabs.map(([id, label]) => <button key={id} onClick={() => setActiveTab(id)} className={`shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium ${activeTab === id ? 'border-blue-700 text-blue-800' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
      </div>
      {busy && activeTab !== 'profile' ? <LoadingState label="Loading your library account…" /> : (
        <>
          {activeTab === 'overview' && <Overview loans={activeLoans} reservations={data.reservations} outstanding={outstanding} payments={data.payments} setTab={setActiveTab} />}
          {activeTab === 'loans' && <LoanList loans={activeLoans} actionId={actionId} onRenew={(loan) => runAction(recordId(loan), () => renewLoan(recordId(loan)), 'Loan renewed.')}/>}
          {activeTab === 'history' && <LoanList loans={data.history} actionId={actionId} />}
          {activeTab === 'reservations' && <ReservationList reservations={data.reservations} actionId={actionId} onCancel={(item) => runAction(recordId(item), () => cancelReservation(recordId(item)), 'Reservation cancelled.')}/>}
          {activeTab === 'fines' && <FineList fines={data.fines} phone={phone} setPhone={setPhone} actionId={actionId} onPay={pay}/>}
          {activeTab === 'payments' && <PaymentList payments={data.payments}/>}
          {activeTab === 'recommendations' && (data.recommendations.length ? <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{data.recommendations.map((book, index) => <BookCard key={recordId(book)} book={book} index={index} />)}</div> : <EmptyState title="No recommendations available">Borrowing history and available titles help personalize suggestions.</EmptyState>)}
          {activeTab === 'profile' && <ProfileForm register={register} errors={errors} handleSubmit={handleSubmit} onSubmit={saveProfile} isSubmitting={isSubmitting} />}
        </>
      )}
    </div>
  )
}

function Overview({ loans, reservations, outstanding, payments, setTab }) {
  const metrics = [
    { title: 'Active loans', value: loans.length, icon: BookOpen, tab: 'loans' },
    { title: 'Reservations', value: reservations.filter((item) => ['WAITING', 'READY'].includes(item.status)).length, icon: Clock3, tab: 'reservations' },
    { title: 'Outstanding fines', value: outstanding.length, icon: Wallet, tab: 'fines' },
    { title: 'Payments', value: payments.length, icon: CreditCard, tab: 'payments' }
  ]
  return <div><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{metrics.map(({ title, value, icon: Icon, tab }) => <button key={title} onClick={() => setTab(tab)} className="rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm hover:border-blue-200"><div className="flex items-center justify-between text-xs text-slate-500">{title}<Icon size={17} className="text-blue-700" /></div><p className="mt-3 font-serif text-3xl font-semibold text-navy-900">{value}</p></button>)}</div><div className="mt-6 rounded-xl border border-slate-200 bg-white p-5"><h2 className="font-serif text-lg font-semibold text-navy-900">Your next steps</h2><ul className="mt-4 grid gap-3 text-sm text-slate-600 sm:grid-cols-2"><li>Review due dates and renew eligible loans.</li><li>Collect ready reservations before their expiry.</li><li>Resolve outstanding fines to keep borrowing access.</li><li>Update your contact details in My profile.</li></ul></div></div>
}

function LoanList({ loans, actionId, onRenew }) {
  if (!loans.length) return <EmptyState title="No borrowing records yet">When you borrow books, your loan details will appear here.</EmptyState>
  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-serif text-lg font-semibold text-navy-900">Borrowing records</h2></div>{loans.map((loan) => <div key={recordId(loan)} className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-4 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{loan.bookId?.title || 'Library title'}</p><p className="mt-1 text-xs text-slate-500">Issued {date(loan.issuedDate)} · Due {date(loan.dueDate)} · {loan.status}</p></div>{loan.status === 'ACTIVE' && onRenew && <button className="btn btn-outline px-3 py-2" disabled={actionId === recordId(loan)} onClick={() => onRenew(loan)}>Renew <ArrowRight size={13} /></button>}</div>)}</section>
}

function ReservationList({ reservations, actionId, onCancel }) {
  if (!reservations.length) return <EmptyState title="No reservations">Unavailable titles you reserve will appear here.</EmptyState>
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-2 font-serif text-lg font-semibold text-navy-900">Reservations</h2>{reservations.map((item) => <div key={recordId(item)} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{item.bookId?.title || 'Library title'}</p><p className="mt-1 text-xs text-slate-500">{item.status === 'READY' ? `Ready for collection until ${date(item.expiresAt)}` : `${item.status} · Queue position ${item.queuePosition || '—'}`}</p></div>{['WAITING', 'READY'].includes(item.status) && <button className="text-xs font-semibold text-red-700 hover:text-red-900" disabled={actionId === recordId(item)} onClick={() => onCancel(item)}>Cancel reservation</button>}</div>)}</section>
}

function FineList({ fines, phone, setPhone, actionId, onPay }) {
  if (!fines.length) return <EmptyState title="No fines">Your account currently has no fines.</EmptyState>
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-lg font-semibold text-navy-900">Fine balance</h2><label className="text-xs text-slate-600">M-Pesa number<input className="form-control ml-2 inline-block w-44" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="07XX XXX XXX" /></label></div>{fines.map((fine) => <div key={recordId(fine)} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{fine.reason} · {money(fine.amount - fine.paidAmount)}</p><p className="mt-1 text-xs text-slate-500">{fine.description || fine.status}</p></div>{fine.status !== 'PAID' && <button className="btn btn-primary px-3 py-2" disabled={actionId === recordId(fine)} onClick={() => onPay(fine)}>Pay with M-Pesa <ArrowRight size={13} /></button>}</div>)}</section>
}

function PaymentList({ payments }) {
  if (!payments.length) return <EmptyState title="No payments yet">Completed and pending payments will appear here.</EmptyState>
  return <section className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-3 font-serif text-lg font-semibold text-navy-900">Payment history</h2>{payments.map((payment) => <div key={recordId(payment)} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 py-4 last:border-0"><div><p className="text-sm font-semibold text-slate-800">{money(payment.amount)} · {payment.status}</p><p className="mt-1 text-xs text-slate-500">{payment.providerReceipt ? `Receipt ${payment.providerReceipt}` : payment.failureReason || `Requested ${date(payment.createdAt)}`}</p></div><IdCard size={17} className="text-slate-400" /></div>)}</section>
}

function ProfileForm({ register, errors, handleSubmit, onSubmit, isSubmitting }) {
  return <form className="max-w-2xl rounded-xl border border-slate-200 bg-white p-5 sm:p-7" onSubmit={handleSubmit(onSubmit)}><h2 className="mb-5 font-serif text-xl font-semibold text-navy-900">Profile details</h2><div className="grid gap-4 sm:grid-cols-2">{[['fname', 'First name'], ['lname', 'Last name'], ['email', 'Email'], ['phone', 'Phone number'], ['regNo', 'Student registration number']].map(([key, label]) => <label key={key} className="space-y-1.5 text-xs font-medium text-slate-700">{label}<input className="form-control" {...register(key)} />{errors[key] && <span className="block text-red-700">{errors[key].message}</span>}</label>)}</div><button className="btn btn-primary mt-5 px-5 py-2.5" disabled={isSubmitting}>Save profile</button></form>
}
