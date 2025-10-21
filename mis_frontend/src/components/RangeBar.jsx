export default function RangeBar({ min, max, valueMin, valueMax, onChange }) {
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
    const handleMin = (e) => {
    const v = Number(e.target.value);
    const newMin = Math.min(v, valueMax);
    onChange({ min: clamp(newMin, min, max), max: valueMax });
    };
    const handleMax = (e) => {
    const v = Number(e.target.value);
    const newMax = Math.max(v, valueMin);
    onChange({ min: valueMin, max: clamp(newMax, min, max) });
    };
    const pct = (v) => ((v - min) * 100) / (max - min);
    const left = pct(valueMin);
    const right = pct(valueMax);
    return (
    <div className="w-full relative h-8">
    <div className="absolute top-1/2 -translate-y-1/2 h-2 w-full rounded bg-slate-200" />
    <div className="absolute top-1/2 -translate-y-1/2 h-2 bg-blue-400 rounded" style={{ left: `${left}%`, width: `${right - left}%` }} />
    <input type="range" min={min} max={max} value={valueMin} onChange={handleMin} onInput={handleMin} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }} />
    <input type="range" min={min} max={max} value={valueMax} onChange={handleMax} onInput={handleMax} className="absolute w-full bg-transparent" style={{ height: "8px", zIndex: 3 }} />
    </div>
    );
    }