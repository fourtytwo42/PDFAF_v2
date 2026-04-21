import { proxyMultipartPost } from '../../_lib/upstream';
import type { NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  return proxyMultipartPost(request, '/v1/edit/apply-fixes');
}
