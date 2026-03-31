// STUB — will be replaced by P9D-FIX-2 agent
import { NextRequest, NextResponse } from 'next/server'
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  return NextResponse.json({ data: null })
}
