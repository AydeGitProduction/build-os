'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSignOut = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-semibold text-white mb-8">Settings</h1>
      <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 mb-6">
        <h2 className="text-lg font-medium text-white mb-4">Account</h2>
        <p className="text-sm text-zinc-400 mb-6">Manage your account settings.</p>
        <button
          onClick={handleSignOut}
          disabled={loading}
          className="px-4 py-2 text-sm font-medium text-red-400 border border-red-800 rounded-lg hover:bg-red-900/20 disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </div>
  )
}
