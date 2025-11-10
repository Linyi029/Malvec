import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

/** ===== GitHub raw JSON ===== */
export const LABELS_JSON =
  "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json";
export const ANY_DATA_JSON_WITH_TRUE_LABELS = "";

/** ===== Palette ===== */
export const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];
const assignColors = (labels) => {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
};

/** ===== TopBar ===== */
function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-blue-100 border-b border-blue-200">
      <nav className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
        <div className="text-lg font-semibold text-slate-800"><a href="/"> Malvec</a></div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li><a href="#about" className="hover:text-blue-500">About us</a></li>
          <li><a href="./evaluation" className="hover:text-blue-500">Evaluation</a></li>
          <li><a href="#tech" className="hover:text-blue-500">Techniques</a></li>
        </ul>
      </nav>
    </header>
  );
}

/** ===== Animated Bullets ===== */
function AnimatedBullets({ items, playKey, title }) {
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

/** ===== CircleProgress ===== */
function CircleProgress({ durationSec, status, onDone, size = 64 }) {
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

/** ===== Home 主組件 ===== */
export default function Home() {
  const navigate = useNavigate();
  useEffect(() => { document.title = "File Uploading"; }, []);
  const [labelChoices, setLabelChoices] = useState([]);
  const colors = useMemo(() => assignColors(labelChoices), [labelChoices]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(LABELS_JSON);
        const js = await r.json();
        const arr = Array.isArray(js) ? js : js.labels || [];
        setLabelChoices([...new Set(arr.map(String))]);
      } catch { }
    })();
  }, []);

  /** ===== 狀態 ===== */
  const [activeQueue, setActiveQueue] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentBatchTotal, setCurrentBatchTotal] = useState(0);
  const [lastBatchTotal, setLastBatchTotal] = useState(0);
  const bulletItems = ["PE 32-file", "is .exe", "is UPX compressed"];
  const [bulletPlayKey, setBulletPlayKey] = useState(0);
  const [bulletsDone, setBulletsDone] = useState(false);
  const [circleStep, setCircleStep] = useState(0);
  const [circleDone, setCircleDone] = useState([false, false, false]);

  const nextId = useRef(1);
  const randomPred = (filename) => {
    if (!labelChoices?.length) return "unknown";
    if (filename.toLowerCase().includes("dogwaffle")) return "GOODWARE";
    return labelChoices[Math.floor(Math.random() * labelChoices.length)];
  };

  /** ===== Upload Handling ===== */
  const handleFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const ALLOWED_EXT = /\.(exe)$/i;
    const valid = files.filter(f => ALLOWED_EXT.test(f.name));
    if (!valid.length) return alert("請上傳 .exe 檔案");
    if (!processing && activeQueue.length === 0) {
      setActiveQueue(valid);
      setCurrentBatchTotal(valid.length);
      setLastBatchTotal(valid.length);
      startNextFile(valid[0]);
    } else {
      setPendingQueue(prev => prev.concat(valid));
    }
  };
  const onInputChange = (e) => handleFiles(e.target.files);
  const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

  /** ===== 開始處理下一個檔案 ===== */
  const startNextFile = (file) => {
    if (!file) return;
    setProcessing(true);
    setBulletsDone(false);
    setCircleStep(0);
    setCircleDone([false, false, false]);
    setBulletPlayKey(k => k + 1);
    const totalMs = bulletItems.length * 3000 + 2000;
    setTimeout(() => {
      setBulletsDone(true);
      setCircleStep(1);
    }, totalMs);
  };

  /** ===== 呼叫 API 分析 ===== */
  const analyzeFile = async (file) => {
    try {
      const formData = new FormData();
      formData.append("file", file);
      console.log("📤 Uploading:", file.name);
      const resp = await fetch("http://127.0.0.1:8000/api/analyze", {
        method: "POST",
        body: formData,
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
      const result = await resp.json();
      console.log("✅ Result:", result);
      navigate("/report", {
        state: {
          filename: result.filename,
          predLabel: result.prediction?.final_label || "Unknown",
          attention_heatmap: result.attention_heatmap || null,
          prediction: result.prediction,
          disasm_success: result.disasm_success,
          unpack_info: result.details,
        },
      });
    } catch (err) {
      console.error("❌ Error:", err);
      alert(`分析失敗：${err.message}`);
    }
  };

  /** ===== 圈圈完成邏輯 ===== */
  const handleCircleDone = async (idx) => {
    setCircleDone(prev => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });
    if (idx < 3) {
      setCircleStep(idx + 2);
    } else {
      const file = activeQueue[0];
      if (file) await analyzeFile(file);  // ✅ 這裡呼叫 FastAPI
      const id = nextId.current++;
      setBulletPlayKey(-1);
      setCircleStep(0);
      setCircleDone([false, false, false]);
      setActiveQueue(prev => {
        const rest = prev.slice(1);
        if (rest.length > 0) {
          setProcessing(false);
          setTimeout(() => startNextFile(rest[0]), 0);
        } else {
          setProcessing(false);
          if (pendingQueue.length > 0) {
            const nextBatch = pendingQueue.slice();
            setPendingQueue([]);
            setActiveQueue(nextBatch);
            setCurrentBatchTotal(nextBatch.length);
            setLastBatchTotal(nextBatch.length);
            setTimeout(() => startNextFile(nextBatch[0]), 0);
          } else {
            setCurrentBatchTotal(0);
          }
        }
        return rest;
      });
    }
  };

  /** ===== 顯示 ===== */
  const remaining = activeQueue.length > 0 ? activeQueue.length : 0;
  const total = activeQueue.length > 0 ? currentBatchTotal : lastBatchTotal;
  const currentFile = activeQueue[0];
  const bulletsTitle = currentFile ? `${currentFile.name} has…` : "等待處理的檔案…";

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
        {/* 上傳區 */}
        <section
          className="xl:col-span-2 border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white shadow-sm"
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Upload .exe (single/multiple or folder)</h2>
            <div className="text-xs text-slate-500">支援多檔或整個資料夾上傳</div>
          </div>
          <div className="flex items-center gap-3">
            <input type="file" multiple webkitdirectory="true" id="folderInput" className="hidden" onChange={onInputChange} />
            <label htmlFor="folderInput" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">Select folder</label>
            <input type="file" accept=".exe" multiple id="filesInput" className="hidden" onChange={onInputChange} />
            <label htmlFor="filesInput" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">Select executables</label>
            <span className="text-sm text-slate-500">或直接拖曳到此區</span>
          </div>
          <div className="mt-4 text-sm text-slate-600">
            {total ? `待處理檔案數：${remaining} / ${total}` : "尚未選擇檔案"}
          </div>
        </section>

        <div className="xl:col-span-1">
          <AnimatedBullets
            items={bulletItems}
            playKey={processing && !bulletsDone ? bulletPlayKey : (processing ? bulletPlayKey : 0)}
            title={bulletsTitle}
          />
        </div>

        {/* Progress */}
        <section className="xl:col-span-3 bg-white border rounded-xl p-6 shadow-sm">
          <h3 className="font-semibold text-slate-800 mb-4">Processing</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {["Disassembling", "Malware Family Identification", "Attention Heatmap Visualization", "SOM Analyzing"].map((label, i) => {
              const status =
                circleStep === 0 ? (circleDone[i] ? "done" : "idle")
                  : (i + 1 < circleStep ? "done" : (i + 1 === circleStep ? "active" : "idle"));
              return (
                <div key={label} className="flex flex-col items-center gap-2">
                  <CircleProgress
                    durationSec={5}
                    status={status}
                    onDone={() => status === "active" && handleCircleDone(i)}
                  />
                  <div className="text-slate-700 text-sm">{label}</div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 text-xs text-slate-500">{processing ? currentFile?.name : ""}</div>
        </section>
      </main>
    </div>
  );
}
