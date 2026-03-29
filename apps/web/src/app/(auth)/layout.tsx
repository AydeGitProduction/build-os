import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'Sign in', template: '%s · Build OS' },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-slate-800 p-4">
      <div className="w-full max-w-md">
        {/* Logo mark */}
        <div className="mb-8 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 shadow-lg">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="mt-3 text-xl font-bold text-white">Build OS</h1>
          <p className="text-sm text-slate-400">AI-native SaaS development</p>
        </div>
        {children}
      </div>
    </div>
  )
}
