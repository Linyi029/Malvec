import { useEffect, useState } from "react";

export default function AnimatedBullets({ items, playKey, title }) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (playKey === -1) { setVisibleCount(0); return; }
    if (!playKey || !items?.length) return;
    setVisibleCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setVisibleCount(v => Math.min(items.length, v + 1));
      if (i >= items.length) clearInterval(id);
    }, 3000);
    return () => clearInterval(id);
  }, [items, playKey]);

  return (
    <div className="bg-white border rounded-xl p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-800 mb-2">{title}</h3>
      <ul className="list-disc pl-6 text-sm text-slate-700 min-h-[4rem]">
        {items.slice(0, visibleCount).map((t, idx) => (
          <li key={idx} className="mb-1">{t}</li>
        ))}
      </ul>
    </div>
  );
}
