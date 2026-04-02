// src/app/api/integrations/test/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { testProviderConnection } from '@/lib/integrations/tester';

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { connection_id } = body;

  if (!connection_id) {
    return NextResponse.json({ error: 'connection_id is required' }, { status: 400 });
  }

  const connection = await db.providerConnection.findFirst({
    where: {
      id: connection_id,
      user_id: session.user.id,
    },
    include: { provider: true },
  });

  if (!connection) {
    return NextResponse.json({ error: 'Connection not found' }, { status: 404 });
  }

  const start = Date.now();

  try {
    const result = await testProviderConnection(connection);
    const latency_ms = Date.now() - start;
    const tested_at = new Date().toISOString();

    // Update connection status and last_tested_at
    await db.providerConnection.update({
      where: { id: connection_id },
      data: {
        status: result.success ? 'connected' : 'error',
        last_tested_at: new Date(tested_at),
        error_message: result.success ? null : result.message,
        updated_at: new Date(tested_at),
      },
    });

    return NextResponse.json({
      success: result.success,
      status: result.success ? 'connected' : 'error',
      message: result.message,
      tested_at,
      latency_ms,
    });
  } catch (error) {
    const tested_at = new Date().toISOString();

    await db.providerConnection.update({
      where: { id: connection_id },
      data: {
        status: 'error',
        last_tested_at: new Date(tested_at),
        error_message: String(error),
        updated_at: new Date(tested_at),
      },
    });

    return NextResponse.json({
      success: false,
      status: 'error',
      message: 'Connection test failed',
      tested_at,
    });
  }
}