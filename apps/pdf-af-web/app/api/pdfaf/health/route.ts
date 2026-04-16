import { proxyJsonGet } from '../_lib/upstream';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  return proxyJsonGet(request, '/v1/health');
}
