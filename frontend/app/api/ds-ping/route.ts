// app/api/ds-ping/route.ts
import { NextResponse } from 'next/server';
import { getDsClient } from '@/lib/docusign';

export async function GET() {
  try {
    const { apiClient, accountId } = await getDsClient();
    // simple ping: list envelope statuses (empty filter)
    const envelopesApi = new (await import('docusign-esign')).EnvelopesApi(apiClient);
    await envelopesApi.listStatusChanges(accountId, { fromDate: '2024-01-01' });
    return NextResponse.json({ ok: true, accountId });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message }, { status: 500 });
  }
}
