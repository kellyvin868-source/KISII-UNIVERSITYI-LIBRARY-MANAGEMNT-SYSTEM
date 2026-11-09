import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import AppLayout from './components/AppLayout'
import { LoadingState } from './components/Feedback'
import ProtectedRoute from './components/ProtectedRoute'

const AccountPage = lazy(() => import('./pages/AccountPage'))
const AssistantPage = lazy(() => import('./pages/AssistantPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const BookDetailPage = lazy(() => import('./pages/BookDetailPage'))
const CatalogPage = lazy(() => import('./pages/CatalogPage'))
const StaffPage = lazy(() => import('./pages/StaffPage'))

function NotFoundPage() {
  return <section className="mx-auto grid min-h-[60vh] max-w-3xl place-items-center px-4 text-center"><div><p className="text-sm font-semibold uppercase tracking-widest text-blue-700">404 · Page not found</p><h1 className="mt-3 font-serif text-4xl font-semibold text-navy-900">This page isn’t on our shelves.</h1><a href="/" className="btn btn-primary mt-6 px-5 py-3">Return to the catalog</a></div></section>
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors closeButton />
      <Suspense fallback={<LoadingState label="Loading page…" />}>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<CatalogPage />} />
            <Route path="books/:id" element={<BookDetailPage />} />
            <Route path="login" element={<AuthPage mode="login" />} />
            <Route path="register" element={<AuthPage mode="register" />} />
            <Route path="assistant" element={<AssistantPage />} />
            <Route path="account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
            <Route path="staff" element={<ProtectedRoute roles={['ADMIN', 'LIBRARIAN']}><StaffPage /></ProtectedRoute>} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
