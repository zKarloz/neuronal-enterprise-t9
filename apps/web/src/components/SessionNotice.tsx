/** Muestra un aviso informativo solo una vez por pestaña/sesión del navegador. */
import { useEffect, useState, type ReactNode } from 'react';
import { Notice } from './ui';
import type { ToastTone } from './ToastProvider';

export function SessionNotice({ storageKey, tone = 'info', children }: {
  storageKey: string; tone?: ToastTone; children: ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem(`neurolab-notice-${storageKey}`)) return;
      sessionStorage.setItem(`neurolab-notice-${storageKey}`, 'shown');
    } catch { /* En modo privado el aviso continúa siendo no bloqueante. */ }
    setVisible(true);
  }, [storageKey]);
  return visible ? <Notice tone={tone}>{children}</Notice> : null;
}
