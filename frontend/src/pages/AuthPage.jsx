import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { apiErrorMessage } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'

const schemas = {
  login: z.object({
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(1, 'Enter your password.')
  }),
  register: z.object({
    fname: z.string().trim().min(1, 'First name is required.'),
    lname: z.string().trim().min(1, 'Last name is required.'),
    email: z.string().email('Enter a valid email address.'),
    password: z.string().min(8, 'Use at least 8 characters.').max(72, 'Password must be at most 72 characters.'),
    regNo: z.string().trim().min(3, 'Registration number is required.').max(30),
    phone: z.string().optional()
  })
}

export default function AuthPage({ mode }) {
  const isRegister = mode === 'register'
  const { member, signIn, signUp } = useAuth()
  const { notify } = useNotifications()
  const navigate = useNavigate()
  const location = useLocation()
  const {
    register, handleSubmit, formState: { errors, isSubmitting }
  } = useForm({ resolver: zodResolver(schemas[mode]), defaultValues: { email: '' } })

  if (member) return <Navigate to="/account" replace />

  async function submit(values) {
    try {
      if (isRegister) await signUp(values)
      else await signIn(values)
      notify(isRegister ? 'Your account is ready. Verify enrollment before borrowing.' : 'Welcome back.')
      navigate(location.state?.from || '/account', { replace: true })
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-132px)] max-w-6xl items-center gap-12 px-4 py-12 md:grid-cols-2 md:px-8">
      <section className="hidden rounded-2xl bg-navy-900 p-10 text-white md:block">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-slate-200"><ArrowLeft size={15} /> Return to the catalog</Link>
        <div className="mt-24 max-w-md">
          <BookOpen className="mb-6 text-gold-300" size={35} />
          <h1 className="font-serif text-4xl font-semibold leading-tight">{isRegister ? 'A world of knowledge, within reach.' : 'Your library, wherever you are.'}</h1>
          <p className="mt-4 text-sm leading-6 text-slate-300">{isRegister ? 'Create your member account to explore the Kisii University Library collection and manage your reading.' : 'Sign in to manage your loans, reservations, and library profile.'}</p>
        </div>
      </section>
      <section className="mx-auto w-full max-w-md">
        <Link to="/" className="mb-8 inline-flex items-center gap-2 text-xs text-slate-500 md:hidden"><ArrowLeft size={14} /> Back to catalog</Link>
        <p className="text-xs font-semibold uppercase tracking-[.16em] text-blue-700">Kisii University Library</p>
        <h1 className="mt-3 font-serif text-3xl font-semibold text-navy-900">{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-2 text-sm text-slate-500">{isRegister ? 'Register with your university student number.' : 'Sign in to continue to your library account.'}</p>
        <form className="mt-8 space-y-4" onSubmit={handleSubmit(submit)} noValidate>
          {isRegister && <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="First name" error={errors.fname?.message}><input className="form-control" autoComplete="given-name" {...register('fname')} /></FormField>
            <FormField label="Last name" error={errors.lname?.message}><input className="form-control" autoComplete="family-name" {...register('lname')} /></FormField>
          </div>}
          <FormField label="University email" error={errors.email?.message}><input className="form-control" type="email" autoComplete="email" {...register('email')} /></FormField>
          {isRegister && <>
            <FormField label="Registration number" error={errors.regNo?.message}><input className="form-control" autoComplete="off" {...register('regNo')} /></FormField>
            <FormField label="Phone number (optional)" error={errors.phone?.message}><input className="form-control" type="tel" autoComplete="tel" {...register('phone')} /></FormField>
          </>}
          <FormField label="Password" error={errors.password?.message}><input className="form-control" type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} {...register('password')} /></FormField>
          <button className="btn btn-primary w-full py-3" type="submit" disabled={isSubmitting}>{isSubmitting ? 'Please wait…' : isRegister ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="mt-5 text-center text-xs text-slate-500">{isRegister ? 'Already a member?' : 'New to the library?'} <Link className="font-semibold text-blue-700 hover:text-blue-900" to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>
      </section>
    </div>
  )
}

function FormField({ label, error, children }) {
  return <label className="block space-y-1.5 text-xs font-medium text-slate-700">{label}{children}{error && <span className="block text-xs font-normal text-red-700">{error}</span>}</label>
}
