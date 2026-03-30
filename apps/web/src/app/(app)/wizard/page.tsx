import { createServerSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { IrisWorkspace } from '@/components/iris/IrisWorkspace'

export const metadata = {
  title: 'IRIS Wizard — Build OS',
  description: 'AI-powered project wizard',
}

export default async function WizardPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return <IrisWorkspace userId={user.id} />
}
