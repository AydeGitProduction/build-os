import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IrisWorkspace } from '@/components/iris/IrisWorkspace'

export const metadata = {
  title: 'IRIS Wizard — Build OS',
  description: 'AI-powered project wizard',
}

export default async function WizardPage() {
  const supabase = createServerSupabaseClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    redirect('/login')
  }

  return <IrisWorkspace userId={session.user.id} />
}
