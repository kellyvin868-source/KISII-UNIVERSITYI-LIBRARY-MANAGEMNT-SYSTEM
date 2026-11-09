import { useState } from 'react'
import { BookOpen, Bot, CircleUserRound, LibraryBig, LogIn, LogOut, Menu, X } from 'lucide-react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useNotifications } from '../contexts/NotificationContext'
import { apiErrorMessage } from '../api/client'

const linkStyle = ({ isActive }) => `nav-link ${isActive ? 'nav-active' : ''}`

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { member, signOut } = useAuth()
  const { notify } = useNotifications()
  const navigate = useNavigate()

  async function handleSignOut() {
    try {
      await signOut()
      notify('You have signed out.')
      navigate('/')
    } catch (error) {
      notify(apiErrorMessage(error), 'error')
    }
  }

  const navigation = (
    <>
      <NavLink to="/" end className={linkStyle} onClick={() => setMenuOpen(false)}><BookOpen size={16} /> Discover</NavLink>
      {member && <NavLink to="/account" className={linkStyle} onClick={() => setMenuOpen(false)}><CircleUserRound size={16} /> My account</NavLink>}
      {['ADMIN', 'LIBRARIAN'].includes(member?.role) && <NavLink to="/staff" className={linkStyle} onClick={() => setMenuOpen(false)}><LibraryBig size={16} /> Staff desk</NavLink>}
      <NavLink to="/assistant" className={linkStyle} onClick={() => setMenuOpen(false)}><Bot size={16} /> AI assistant</NavLink>
    </>
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
          <Link className="flex items-center gap-2.5 font-semibold tracking-tight text-navy-900" to="/">
            <span className="grid size-9 place-items-center rounded-lg bg-navy-900 text-white"><BookOpen size={19} /></span>
            <span>Kisii <span className="text-blue-700">Library</span><small className="block text-[9px] font-medium tracking-[.15em] text-slate-500">UNIVERSITY LIBRARY</small></span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">{navigation}</nav>
          <div className="ml-auto hidden items-center gap-3 md:flex">
            {member ? (
              <>
                <span className="max-w-40 truncate text-xs text-slate-600">{member.fname} {member.lname}</span>
                <button className="btn btn-outline px-3 py-2" onClick={handleSignOut}><LogOut size={15} /> Sign out</button>
              </>
            ) : <Link className="btn btn-primary px-4 py-2" to="/login"><LogIn size={15} /> Sign in</Link>}
          </div>
          <button className="ml-auto grid size-9 place-items-center rounded-md border border-slate-200 text-slate-700 md:hidden" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}>
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
        {menuOpen && <nav className="grid gap-1 border-t border-slate-100 px-4 py-3 md:hidden">{navigation}{member ? <button className="nav-link" onClick={handleSignOut}><LogOut size={16} /> Sign out</button> : <Link className="nav-link" to="/register" onClick={() => setMenuOpen(false)}>Create an account</Link>}</nav>}
      </header>
      <main className="min-h-[calc(100vh-132px)]"><Outlet /></main>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <span>Kisii University · Library Management System</span><span>Knowledge for every journey.</span>
        </div>
      </footer>
    </div>
  )
}
