'use client';

import { useEffect, useState } from 'react';
import type { DesktopLocalLlmState } from '../../types/health';
import type { DesktopLocalAiBridge } from '../../types/desktop';

function resolveDesktopLocalAiBridge(): DesktopLocalAiBridge | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.pdfafDesktop?.localAi;
}

export function useDesktopLocalAiState() {
  const [state, setState] = useState<DesktopLocalLlmState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desktopBridge, setDesktopBridge] = useState<DesktopLocalAiBridge | undefined>(() => resolveDesktopLocalAiBridge());

  useEffect(() => {
    const existingBridge = resolveDesktopLocalAiBridge();
    if (existingBridge) {
      setDesktopBridge(existingBridge);
      return;
    }

    let active = true;
    const interval = window.setInterval(() => {
      const nextBridge = resolveDesktopLocalAiBridge();
      if (!nextBridge || !active) return;
      setDesktopBridge(nextBridge);
      window.clearInterval(interval);
    }, 250);

    const timeout = window.setTimeout(() => {
      window.clearInterval(interval);
    }, 10_000);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!desktopBridge) return;

    let active = true;
    void desktopBridge.getState()
      .then((nextState) => {
        if (!active) return;
        setState(nextState);
        setError(null);
      })
      .catch((nextError: unknown) => {
        if (!active) return;
        setError(nextError instanceof Error ? nextError.message : 'Could not read local AI state.');
      });

    const unsubscribe = desktopBridge.subscribe((nextState) => {
      setState(nextState);
      setError(null);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [desktopBridge]);

  return {
    desktopBridge,
    hasDesktopBridge: Boolean(desktopBridge),
    state,
    error,
    setState,
    setError,
  };
}
