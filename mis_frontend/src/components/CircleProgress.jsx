import { useEffect, useState } from "react";

export default function CircleProgress({ durationSec, status, onDone, size = 64 }) {
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const [offset, setOffset] = useState(circumference);

  const baseStroke = status === "idle" ? "#e5e7eb" : "#3b82f6";
  const animate = status === "active";

  useEffect(() => {
    if (!animate) { setOffset(status === "done" ? 0 : circumference); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / (durationSec * 1000));
      setOffset(circumference * (1 - t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [animate, durationSec, circumference, onDone, status]);

  return (
    <svg width={size} height={size} viewBox="0 0 80 80" className="mx-auto">
      <circle cx="40" cy="40" r={radius} stroke="#e5e7eb" strokeWidth="8" fill="none" />
      <circle
        cx="40" cy="40" r={radius}
        stroke={baseStroke} strokeWidth="8" fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 40 40)"
      />
    </svg>
  );
}
