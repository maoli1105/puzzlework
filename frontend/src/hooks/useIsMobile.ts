/**
 * useIsMobile — viewport width による mobile 判定。
 * breakpoint 未満を mobile とみなす（デフォルト 640px）。
 * MediaQueryList で変化を追跡し、リサイズに追従する。
 */

import { useState, useEffect } from 'react';

export function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}
