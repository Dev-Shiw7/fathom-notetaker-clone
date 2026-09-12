import { NextResponse } from 'next/server';
import { search } from '@/lib/data';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  if (q.trim().length < 2) {
    return NextResponse.json({ hits: [] });
  }

  const hits = await search(q);
  return NextResponse.json({ hits });
}
