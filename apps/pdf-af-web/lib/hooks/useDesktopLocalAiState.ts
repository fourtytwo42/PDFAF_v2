'use client';

import { useEffect, useState } from 'react';
import type { DesktopLocalLlmState } from '../../types/health';

export function useDesktopLocalAiState() {
  const [state, setState] = useState<DesktopLocalLlmState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const desktopBridge = typeof window !== 'undefined' ? window.pdfafDesktop?.localAi : undefined;

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
