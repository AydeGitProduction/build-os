// STUB — will be replaced by P9D-FIX-2 agent
import { redirect } from 'next/navigation'
interface Props { params: { id: string } }
export default function WizardPage({ params }: Props) {
  redirect(`/projects/${params.id}/autopilot`)
}
