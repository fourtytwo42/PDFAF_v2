import { randomUUID } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'pdf_af_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export interface SessionContext {
  sessionId: string;
  apply(response: NextResponse): void;
}

export function resolveSession(request: NextRequest): SessionContext {
  const existing = request.cookies.get(SESSION_COOKIE_NAME)?.value?.trim();
  const sessionId = existing || randomUUID();

  return {
    sessionId,
    apply(response) {
      if (existing) return;

      response.cookies.set(SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: false,
        path: '/',
        maxAge: SESSION_MAX_AGE_SECONDS,
      });
    },
  };
}
