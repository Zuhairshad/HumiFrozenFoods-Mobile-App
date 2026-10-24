import { useCallback, useEffect, useRef, useState } from 'react';

/** Boolean that flips true for `ms` after `trigger()` (plus icon morphs to a checkmark). */
export function useAddFeedback(ms = 1200) {
  const [added, setAdded] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const trigger = useCallback(() => {
    setAdded(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAdded(false), ms);
  }, [ms]);

  return { added, trigger };
}
