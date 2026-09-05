import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router'
import Home from './pages/Home'
import { useI18n } from '@/contexts/I18nContext'

// Docs page is secondary — split it out of the landing bundle.
const About = lazy(() => import('./pages/About'))

export default function App() {
  const { t } = useI18n();
  return (
    <Suspense fallback={
      <main className="mx-auto min-h-screen max-w-4xl px-4 py-10 md:px-6" aria-busy="true">
        <p role="status" className="font-mono text-sm text-muted-foreground">{t('common.loading')}</p>
        <a href="/" className="mt-6 inline-block font-mono text-xs text-primary underline underline-offset-4">{t('about.backHome')}</a>
      </main>
    }>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
      </Routes>
    </Suspense>
  )
}
