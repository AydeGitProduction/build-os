// STUB — will be replaced by P9D-FIX-2 agent
import { NextRequest, NextResponse } from 'next/server'
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ reply: 'IRIS is initializing...' })
}
