// src/app/api/integrations/route.ts

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const providers = await db.provider.findMany({
      where: { is_active: true },
      orderBy: { name: 'asc' },
    });

    const connections = await db.providerConnection.findMany({
      where: { user_id: session.user.id },
    });

    const connectionMap = new Map(
      connections.map((c) => [c.provider_id, c])
    );

    const result = providers.map((provider) => ({
      ...provider,
      connection: connectionMap.get(provider.id) ?? null,
    }));

    return NextResponse.json({ providers: result });
  } catch (error) {
    console.error('[GET /api/integrations]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}