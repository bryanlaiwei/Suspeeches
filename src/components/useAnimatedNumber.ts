"use client";

import { useEffect, useRef, useState } from "react";

/** Critically damped-ish spring toward `target`. Returns the displayed value. */
export function useAnimatedNumber(target: number, stiffness = 6) {
  const [value, setValue] = useState(target);
  const current = useRef(target);
  const velocity = useRef(0);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const diff = target - current.current;
      velocity.current += diff * stiffness * stiffness * dt;
      velocity.current *= Math.exp(-2 * stiffness * dt);
      current.current += velocity.current * dt;
      if (Math.abs(diff) < 0.05 && Math.abs(velocity.current) < 0.05) {
        current.current = target;
        setValue(target);
        return;
      }
      setValue(current.current);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, stiffness]);

  return value;
}
