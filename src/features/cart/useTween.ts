import { useEffect, useRef, useState } from 'react';

/** Eases a displayed number toward `target` so totals "roll" instead of jumping. */
export function useTween(target: number, duration = 380): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  const current = useRef(target);

  useEffect(() => {
    const start = Date.now();
    const origin = current.current;
    from.current = origin;
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const t = Math.min(1, (Date.now() - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (target - origin) * eased;
      current.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
