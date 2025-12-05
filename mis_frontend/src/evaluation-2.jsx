import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { useLocation, useNavigate } from "react-router-dom";

/** GitHub raw JSON URLs (fill these) */
const EMBEDDING_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/data_w_time_finetuned_cut.json";
const LABEL_LIST_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json";
const somUrls = [
  "https://gist.githubusercontent.com/111306047/452625822b11fc860ab0b0d30594f81c/raw/fa1ee25ffed45b31d3219a5be7568d7f97a99086/APT30.json",
  "https://gist.githubusercontent.com/111306047/1bc7e9713b5faf894897f864d976ac4e/raw/bdbfc6c0cc60b32de86a60d4e7fb9a6bf0cbd28d/Dropper.json",
]

/** Palette (provided) */
const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];

function assignColors(labels) {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
}

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

const Section = ({ title, children, right }) => (
  <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
    <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
      <h3 className="text-slate-800 font-semibold">{title}</h3>
      {right}
    </div>
    <div className="p-4">{children}</div>
  </section>
);

function RangeBar({ min, max, valueMin, valueMax, onChange }) {
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

export default function EvaluationPage() {
  const location = useLocation();  
  const navigate = useNavigate();
  const state = location?.state || {};  

  useEffect(() => { document.title = "Periodic Evaluation"; }, []);

  const [labelList, setLabelList] = useState(null);
  const [allPoints, setAllPoints] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const [timeMin, setTimeMin] = useState(1);
  const [timeMax, setTimeMax] = useState(1);
  const [selMin, setSelMin] = useState(1);
  const [selMax, setSelMax] = useState(1);
  
  // ✨ 儲存原始數據的實際最大時間戳（毫秒）
  const [actualMaxMs, setActualMaxMs] = useState(0);

  const [somDatasets, setSomDatasets] = useState([]);
  const [somTitles, setSomTitles] = useState([]);
  const [somErr, setSomErr] = useState("");
  const [somIndex, setSomIndex] = useState(0);
  const [plotRevision, setPlotRevision] = useState(0);
  const somGraphRefs = useRef([]);
  somGraphRefs.current = [];

  const [newSampleSomPosition, setNewSampleSomPosition] = useState(null);
  
  const LS_KEY = "somAnalysis.latest";
  const urlSom = (() => {
    try { return JSON.parse(new URLSearchParams(location.search).get("som") || "null"); } catch { return null; }
  })();
  const somAnalysisFromState = state.somAnalysis || urlSom || (() => {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch { return null; }
  })();
  useEffect(() => {
    if (somAnalysisFromState) {
      try { localStorage.setItem(LS_KEY, JSON.stringify(somAnalysisFromState)); } catch {}
    }
  }, [somAnalysisFromState]);

  useEffect(() => {
    setPlotRevision(r => r + 1); 
  }, [somIndex]); 

  const navigateWithBackendResult = (result, fallbackFileName = "unknown.exe") => {
    const somResult = result?.som_analysis || result?.somAnalysis || null;
    const predictedLabel = result?.pred_label || result?.predLabel || "UNKNOWN";
    const filename = result?.filename || fallbackFileName;
    try { localStorage.setItem("somAnalysis.latest", JSON.stringify(somResult)); } catch {}
    navigate("/report", {
      state: {
        somAnalysis: somResult,
        filename,
        predLabel: predictedLabel,
      },
    });
  };

  const registerSomRef = (idx) => (fig, gd) => { somGraphRefs.current[idx] = gd; };

  const [somRandPts, setSomRandPts] = useState([]);
  const [somPredLabels, setSomPredLabels] = useState([]);

  // ✨ 分段拉伸參數：2019 年之前不變，2019 年起拉伸到 2025-03-30
  const stretchParams = useMemo(() => {
    const stretchStartMs = new Date('2019-01-01').getTime(); // 開始拉伸的日期
    const targetEndMs = new Date('2025-03-30').getTime();    // 目標結束日期
    
    // 使用實際數據的最大日期，如果還沒載入則用預設值
    let originalEndMs = actualMaxMs > 0 ? actualMaxMs : new Date('2020-01-01').getTime();
    
    // 邊界處理：如果原始數據最大日期早於拉伸起點，就不拉伸
    if (originalEndMs <= stretchStartMs) {
      console.log("[STRETCH] 原始數據最大日期早於 2019-01-01，不進行拉伸");
      return { stretchStartMs, originalEndMs, targetEndMs, scaleFactor: 1, noStretch: true };
    }
    
    // scaleFactor = (targetEnd - stretchStart) / (originalEnd - stretchStart)
    const scaleFactor = (targetEndMs - stretchStartMs) / (originalEndMs - stretchStartMs);
    
    console.log("[STRETCH] stretchStart:", new Date(stretchStartMs).toISOString().slice(0, 10));
    console.log("[STRETCH] originalEnd (actual tMax):", new Date(originalEndMs).toISOString().slice(0, 10));
    console.log("[STRETCH] targetEnd:", new Date(targetEndMs).toISOString().slice(0, 10));
    console.log("[STRETCH] scaleFactor:", scaleFactor.toFixed(4));
    
    return { stretchStartMs, originalEndMs, targetEndMs, scaleFactor, noStretch: false };
  }, [actualMaxMs]);

  // ✨ 將內部時間戳轉換為「分段拉伸後的顯示日期」
  // 2019 年之前：保持不變
  // 2019 年之後：拉伸到 2019-01-01 ~ 2025-03-30
  const toDisplayDateStr = useCallback((ts) => {
    const { stretchStartMs, scaleFactor, noStretch } = stretchParams;
    const n = Number(ts);
    const originalMs = n < 1e12 ? n * 1000 : n;
    
    if (isNaN(originalMs)) return String(ts);
    
    // 如果不需要拉伸，直接返回原始日期
    if (noStretch) {
      const d = new Date(originalMs);
      return d.toISOString().slice(0, 10);
    }
    
    // 2019 年之前：保持不變
    if (originalMs < stretchStartMs) {
      const d = new Date(originalMs);
      return d.toISOString().slice(0, 10);
    }
    
    // 2019 年及之後：線性拉伸
    // displayMs = stretchStartMs + (originalMs - stretchStartMs) * scaleFactor
    const displayMs = stretchStartMs + (originalMs - stretchStartMs) * scaleFactor;
    const d = new Date(displayMs);
    return isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10);
  }, [stretchParams]);

  // ✨ 將顯示日期轉換回內部時間戳（毫秒）
  // 反向分段拉伸
  const fromDisplayDate = useCallback((dateStr) => {
    const { stretchStartMs, scaleFactor, noStretch } = stretchParams;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    const displayMs = d.getTime();
    
    // 如果不需要拉伸，直接返回
    if (noStretch) {
      return displayMs;
    }
    
    // 2019 年之前：保持不變
    if (displayMs < stretchStartMs) {
      return displayMs;
    }
    
    // 2019 年及之後：反向線性拉伸
    // originalMs = stretchStartMs + (displayMs - stretchStartMs) / scaleFactor
    const originalMs = stretchStartMs + (displayMs - stretchStartMs) / scaleFactor;
    return originalMs;
  }, [stretchParams]);

  // 載入 embedding 數據
  useEffect(() => {
    (async () => {
      try {
        const [labRes, ptRes] = await Promise.all([
          fetch(LABEL_LIST_URL),
          fetch(EMBEDDING_URL),
        ]);
        if (!labRes.ok) throw new Error(`label_list HTTP ${labRes.status}`);
        if (!ptRes.ok) throw new Error(`embedding points HTTP ${ptRes.status}`);
        const [labs, pts] = await Promise.all([labRes.json(), ptRes.json()]);
        setLabelList(labs);
        console.log("[EMB] raw pts.length =", Array.isArray(pts) ? pts.length : -1);
        const hasTime = pts.length && typeof pts[0].first_submission_date !== "undefined";
        let enriched = hasTime
          ? pts.map(r => ({ ...r, time_period: Number(r.first_submission_date) }))
          : pts.map((r, i) => ({ ...r, time_period: i + 1 }));
        const keyOf = (r) => `${r.x}|${r.y}|${r.pred_label ?? ""}|${r.time_period ?? ""}`;
        enriched = Array.from(new Map(enriched.map(r => [keyOf(r), r])).values());
        console.log("[EMB] enriched & dedup length =", enriched.length);
        setAllPoints(() => enriched);
        const tMin = Math.max(1, Math.min(...enriched.map((r) => Number(r.time_period) || 1)));
        const tMax = Math.max(...enriched.map((r) => Number(r.time_period) || 1));
        setTimeMin(tMin);
        setTimeMax(tMax);
        setSelMin(tMin);
        setSelMax(tMax);

        // ✨ 設置實際的最大時間戳，用於分段拉伸計算
        const tMaxMs = tMax < 1e12 ? tMax * 1000 : tMax;
        const tMinMs = tMin < 1e12 ? tMin * 1000 : tMin;
        setActualMaxMs(tMaxMs);
        
        console.log("[TIME STRETCH] 原始數據範圍:", new Date(tMinMs).toISOString().slice(0, 10), "~", new Date(tMaxMs).toISOString().slice(0, 10));
        console.log("[TIME STRETCH] 2019-01-01 之前保持不變，之後拉伸到 2025-03-30");
      } catch (e) {
        setLoadErr(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!somAnalysisFromState) {
      console.log("⚠️ No SOM analysis data from backend");
      setNewSampleSomPosition(null);
      return;
    }
    console.log("🔍 SOM Analysis received:", somAnalysisFromState);
    const position = somAnalysisFromState.winner_position || somAnalysisFromState.position;
    if (position && typeof position.row === 'number' && typeof position.col === 'number') {
      setNewSampleSomPosition({
        row: position.row,
        col: position.col
      });
      console.log(`✅ New sample SOM position: (row=${position.row}, col=${position.col})`);
    } else {
      console.warn("⚠️ Invalid SOM position data:", position);
      setNewSampleSomPosition(null);
    }
  }, [somAnalysisFromState]);

  function buildSomPlotPieMulti(somArray, labelColorsFromAll, opts = {}, newSamplePos = null, extraPoints = []) {
    const {
      radius = 0.35,
      k = 3,
      showOther = true,
      outlineColor = "#333",
      outlineWidth = 0.6,
    } = opts;

    if (!Array.isArray(somArray) || somArray.length === 0) {
      return { traces: [], layout: { title: "Empty SOM" } };
    }

    let maxRow = 0, maxCol = 0;
    for (const c of somArray) {
      if (Number.isFinite(c.row)) maxRow = Math.max(maxRow, c.row);
      if (Number.isFinite(c.col)) maxCol = Math.max(maxCol, c.col);
    }

    const baseTrace = {
      type: "scatter",
      mode: "markers",
      x: somArray.map(c => c.col),
      y: somArray.map(c => c.row),
      marker: { size: 0.1, opacity: 0 },
      hoverinfo: "text",
      text: somArray.map(c => formatPropsForHover(c.proportions, 3)),
      hoverlabel: { align: "left" },
      showlegend: false,
    };

    const shapes = [];
    const OTHER_KEY = "OTHER";

    for (const c of somArray) {
      const x = c.col, y = c.row;
      const props = Object.entries(c.proportions || {}).map(([lab, v]) => [lab, Number(v) || 0]);
      props.sort((a, b) => b[1] - a[1]);
      const top = props.slice(0, k);
      const rest = props.slice(k);
      let otherVal = 0;
      if (showOther && rest.length) {
        otherVal = rest.reduce((a, [, v]) => a + v, 0);
        top.push([OTHER_KEY, otherVal]);
      }
      const total = top.reduce((a, [, v]) => a + v, 0) || 1;
      shapes.push({
        type: "circle",
        xref: "x", yref: "y",
        x0: x - radius, x1: x + radius, y0: y - radius, y1: y + radius,
        line: { width: outlineWidth, color: outlineColor },
        fillcolor: "#ffffff",
        layer: "below",
        opacity: 1
      });
      let acc = 0;
      for (const [lab, val] of top) {
        const frac = (val || 0) / total;
        if (frac <= 0) continue;
        const start = acc * 2 * Math.PI;
        const end = (acc + frac) * 2 * Math.PI;
        acc += frac;
        const segs = Math.max(10, Math.floor((end - start) / (Math.PI / 16)));
        const pts = [];
        for (let s = 0; s <= segs; s++) {
          const t = start + (end - start) * (s / segs);
          pts.push([x + radius * Math.cos(t), y + radius * Math.sin(t)]);
        }
        const path = [
          `M ${x} ${y}`,
          `L ${x + radius * Math.cos(start)} ${y + radius * Math.sin(start)}`,
          ...pts.slice(1).map(([px, py]) => `L ${px} ${py}`),
          "Z",
        ].join(" ");
        shapes.push({
          type: "path",
          path,
          line: { width: 0 },
          fillcolor:
            lab === OTHER_KEY ? "#e5e7eb" : (labelColorsFromAll[lab] || "#7f7f7f"),
          layer: "below",
          opacity: 0.98,
        });
      }
    }

    // 繪製新樣本的標記
    if (newSamplePos && typeof newSamplePos.row === 'number' && typeof newSamplePos.col === 'number') {
      const markerX = newSamplePos.col;
      const markerY = newSamplePos.row;
      const markerRadius = 0.15;
      console.log(`🎯 Adding marker at row=${markerY}, col=${markerX}`);
      shapes.push({
        type: "circle",
        xref: "x", yref: "y",
        x0: markerX - markerRadius * 1.3,
        x1: markerX + markerRadius * 1.3,
        y0: markerY - markerRadius * 1.3,
        y1: markerY + markerRadius * 1.3,
        fillcolor: "rgba(0,0,0,0)",
        line: { width: 0 },
        layer: "above",
        opacity: 0.9
      });
      shapes.push({
        type: "circle",
        xref: "x", yref: "y",
        x0: markerX - markerRadius,
        x1: markerX + markerRadius,
        y0: markerY - markerRadius,
        y1: markerY + markerRadius,
        fillcolor: "black",
        line: { width: 0},
        layer: "above",
        opacity: 1
      });
    }

    const labelsInThisSom = collectLabelsFromSom(somArray, 30);
    const legendTraces = makeLegendTraces(
      labelsInThisSom,
      labelColorsFromAll,
      maxCol + 5,
      maxRow + 5
    );

    const layout = {
      margin: { t: 24, r: 40, b: 40, l: 40 },
      xaxis: { range: [-0.8, maxCol + 0.8], dtick: 1, title: "col", domain: [0, 0.82] },
      yaxis: { range: [maxRow + 0.8, -0.8], dtick: 1, title: "row" },
      hovermode: "closest",
      showlegend: true,
      legend: {
        x: 0.86, y: 1, xanchor: "left", yanchor: "top",
        orientation: "v",
        bgcolor: "rgba(255,255,255,0.9)",
        bordercolor: "rgba(0,0,0,0.1)",
        borderwidth: 1,
        itemwidth: 60
      },
      shapes,
    };

    const testPointTrace = extraPoints?.length ? {
      type: "scatter",
      mode: "markers",
      x: extraPoints.map(p => p.x),
      y: extraPoints.map(p => p.y),
      marker: { size: 10, color: "black" },
      name: "test point",
      showlegend: false,
      hoverinfo: "skip",
    } : null;

    return {
      traces: testPointTrace 
        ? [baseTrace, ...legendTraces, testPointTrace] 
        : [baseTrace, ...legendTraces],
      layout
    };
  }

  function formatPropsForHover(props, digits = 3, topK = 10) {
    const arr = Object.entries(props || {})
      .map(([k, v]) => [k, Number(v) || 0])
      .sort((a, b) => b[1] - a[1])
      .slice(0, topK);
    if (!arr.length) return "(no proportions)";
    return arr.map(([k, v]) => `${k}: ${v.toFixed(digits)}`).join("<br>");
  }

  function collectLabelsFromSom(somArray, maxLabels = 20) {
    const set = new Set();
    for (const c of somArray) {
      for (const lab of Object.keys(c.proportions || {})) set.add(lab);
      if (set.size >= maxLabels) break;
    }
    return [...set];
  }

  function makeLegendTraces(labels, labelColors, offX, offY) {
    return labels.map((lab) => ({
      type: "scatter",
      mode: "markers",
      x: [offX], y: [offY],
      marker: { size: 10, color: labelColors[lab] || "#7f7f7f" },
      name: lab,
      showlegend: true,
      hoverinfo: "skip",
    }));
  }

  function normalizeSomJson(root) {
    const tryArray = (arr) => Array.isArray(arr) ? arr : null;
    const objectValuesIfIndexObject = (obj) => {
      if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
      const keys = Object.keys(obj);
      if (keys.length === 0) return null;
      const isIndexLike = keys.every(k => /^\d+$/.test(k));
      return isIndexLike ? keys.sort((a, b) => a - b).map(k => obj[k]) : null;
    };
    function deepFindArray(node, depth = 0, limit = 6) {
      if (depth > limit || node == null) return null;
      const arr = tryArray(node);
      if (arr) return arr;
      const asIndexArr = objectValuesIfIndexObject(node);
      if (asIndexArr) return asIndexArr;
      if (typeof node === "object") {
        for (const v of Object.values(node)) {
          const a = tryArray(v);
          if (a) {
            const first = a.find(e => e != null);
            if (first && typeof first === "object") return a;
          }
        }
        for (const v of Object.values(node)) {
          const found = deepFindArray(v, depth + 1, limit);
          if (found) return found;
        }
      }
      return null;
    }
    let cells = deepFindArray(root) || [];
    if (!Array.isArray(cells)) cells = [];
    const out = cells.map((c) => {
      const rowRaw = c?.row ?? c?.r ?? c?.i ?? c?.y;
      const colRaw = c?.col ?? c?.column ?? c?.c ?? c?.j ?? c?.x;
      const row = Number(rowRaw);
      const col = Number(colRaw);
      const counts = c?.counts ?? {};
      const proportions = c?.proportions ?? {};
      return {
        ...c,
        row: Number.isFinite(row) ? row : 0,
        col: Number.isFinite(col) ? col : 0,
        counts: counts && typeof counts === "object" ? counts : {},
        proportions: proportions && typeof proportions === "object" ? proportions : {},
      };
    });
    return out.filter(
      (c) =>
        Number.isFinite(c.row) && Number.isFinite(c.col) &&
        (Object.keys(c.proportions).length > 0 || Object.keys(c.counts).length > 0)
    );
  }

  // 載入 SOM 數據
  useEffect(() => {
    (async () => {
      if (!somUrls || !somUrls.length) return;
      try {
        const resps = await Promise.all(
          somUrls.map(u => fetch(u, { cache: "no-store" }))
        );
        resps.forEach((r, i) => {
          if (!r.ok) throw new Error(`SOM[${i}] HTTP ${r.status}`);
        });
        const texts = await Promise.all(resps.map(r => r.text()));
        const jsons = texts.map((t, i) => {
          try {
            return JSON.parse(t);
          } catch (e) {
            console.error(`[SOM] JSON parse failed @${i}`, e, t?.slice(0, 200));
            throw new Error(`SOM[${i}] JSON parse failed`);
          }
        });
        const norm = jsons.map((j, i) => {
          const arr = normalizeSomJson(j);
          console.log(`[SOM] dataset #${i} raw keys:`, j && typeof j === "object" ? Object.keys(j) : typeof j);
          console.log(`[SOM] dataset #${i} normalized length:`, arr.length);
          if (arr.length) console.log(`[SOM] sample[${i}]:`, arr.slice(0, 2));
          return arr;
        });
        const titles = ['SOM-APT30', 'SOM-dropper']
        setSomDatasets(norm);
        setSomTitles(titles);
        setSomErr("");
      } catch (e) {
        console.error(e);
        setSomErr(String(e?.message || e));
        setSomDatasets([]);
      }
    })();
  }, []);

  function knnPredictSom(somArray, qx, qy, k = 5) {
    if (!Array.isArray(somArray) || somArray.length === 0) return { label: "UNKNOWN", scores: {} };
    const eps = 1e-6;
    const distList = somArray.map(c => {
      const dx = qx - Number(c.col || 0);
      const dy = qy - Number(c.row || 0);
      return { cell: c, d: Math.hypot(dx, dy) };
    }).sort((a, b) => a.d - b.d).slice(0, Math.min(k, somArray.length));
    const scores = {};
    for (const { cell, d } of distList) {
      const w = 1 / (d + eps);
      for (const [lab, p] of Object.entries(cell.proportions || {})) {
        const val = Number(p) || 0;
        scores[lab] = (scores[lab] || 0) + w * val;
      }
    }
    let bestLab = "UNKNOWN", bestVal = -Infinity;
    for (const [lab, s] of Object.entries(scores)) if (s > bestVal) { bestVal = s; bestLab = lab; }
    return { label: bestLab, scores };
  }

  const labelColors = useMemo(() => {
    if (!labelList) return {};
    const uniq = Array.isArray(labelList) ? Array.from(new Set(labelList)).filter(Boolean) : [];
    const colorMap = assignColors(uniq);

    if (colorMap["ADWARE.GATOR"]) {
      colorMap["Non-APT30"] = colorMap["ADWARE.GATOR"];
    }
    
    if (colorMap["ADWARE.GENERIC"]) {
      colorMap["APT30"] = colorMap["ADWARE.GENERIC"];
    }

    if (colorMap["ADWARE.GATOR"]) {
      colorMap["Non-Dropper"] = colorMap["ADWARE.GATOR"];
    }
    
    if (colorMap["ADWARE.GENERIC"]) {
      colorMap["Dropper"] = colorMap["ADWARE.GENERIC"];
    }

    return colorMap;
  }, [labelList]);

  const filteredPoints = useMemo(() => {
    if (!allPoints) return null;
    const lo = Math.max(timeMin, Math.min(selMin, selMax));
    const hi = Math.min(timeMax, Math.max(selMin, selMax));
    return allPoints.filter(r => {
      const t = Number(r["time_period"]) || 0;
      return t >= lo && t <= hi;
    });
  }, [allPoints, timeMin, timeMax, selMin, selMax]);

  const embeddingTraces = useMemo(() => {
    if (!filteredPoints) return [];
    const by = new Map();
    for (const r of filteredPoints) {
      const k = r["pred_label"] || "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    const order = Array.isArray(labelList) ? labelList : Array.from(by.keys());
    return order.filter(lab => by.has(lab)).map(lab => {
      const arr = by.get(lab);
      return {
        type: "scattergl",
        mode: "markers",
        name: lab,
        x: arr.map(d => d.x),
        y: arr.map(d => d.y),
        marker: { size: 5, color: labelColors[lab] },
        hoverinfo: "text",
        // ✨ 使用 toDisplayDateStr 顯示拉伸後的日期
        text: arr.map(d => {
          const lab = d["pred_label"] ?? "-";
          return `${lab}${d.time_period ? `<br>${toDisplayDateStr(d.time_period)}` : ""}`;
        })
      };
    });
  }, [filteredPoints, labelList, labelColors, toDisplayDateStr]);

  const classCounts = useMemo(() => {
    if (!filteredPoints) return null;
    const m = new Map();
    for (const r of filteredPoints) {
      const k = r["pred_label"] || "other";
      m.set(k, (m.get(k) || 0) + 1);
    }
    const labels = Array.from(m.keys());
    const counts = labels.map(l => m.get(l));
    const colors = labels.map(l => labelColors[l]);
    return { labels, counts, colors };
  }, [filteredPoints, labelColors]);

  const [edits, setEdits] = useState({});
  useEffect(() => { setEdits({}); }, [selMin, selMax]);

  const rangeInfo = useMemo(() => {
    if (!allPoints || !filteredPoints) return null;
    const total = allPoints.length;
    const sel = filteredPoints.length;
    const pct = total ? Math.round((sel / total) * 100) : 0;
    return { sel, total, pct };
  }, [allPoints, filteredPoints]);

  const commitMin = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMin(Math.max(timeMin, Math.min(n, selMax))); };
  const commitMax = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMax(Math.min(timeMax, Math.max(n, selMin))); };

  return (
    <div className="min-h-screen">
      <TopBar />

      {/* Filters */}
      <div className="sticky top-[56px] z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col w-32">
                <label className="text-xs text-slate-500 mb-1">oldest </label>
                {/* ✨ 使用 toDisplayDateStr 和 fromDisplayDate */}
                <input
                  type="date"
                  min={toDisplayDateStr(timeMin)}
                  max={toDisplayDateStr(selMax)}
                  value={toDisplayDateStr(selMin)}
                  onChange={(e) => {
                    const raw = fromDisplayDate(e.target.value);
                    if (raw !== null) commitMin(raw);
                  }}
                  className="border rounded px-2 py-1"
                />
              </div>
              <div className="flex-1">
                <RangeBar
                  min={timeMin}
                  max={timeMax}
                  valueMin={selMin}
                  valueMax={selMax}
                  onChange={({ min, max }) => {
                    setSelMin(min);
                    setSelMax(max);
                  }}
                />
                {/* ✨ 使用 toDisplayDateStr 顯示拉伸後的日期 */}
              </div>
              <div className="flex flex-col w-32">
                <label className="text-xs text-slate-500 mb-1">latest </label>
                {/* ✨ 使用 toDisplayDateStr 和 fromDisplayDate */}
                <input
                  type="date"
                  min={toDisplayDateStr(selMin)}
                  max={toDisplayDateStr(timeMax)}
                  value={toDisplayDateStr(selMax)}
                  onChange={(e) => {
                    const raw = fromDisplayDate(e.target.value);
                    if (raw !== null) commitMax(raw);
                  }}
                  className="border rounded px-2 py-1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* Scatter */}
        <Section title="Embedding 降維圖（本月新增 & 完成分析）">
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!filteredPoints ? <div>Loading…</div> : (
            <Plot data={embeddingTraces} layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h" } }} style={{ width: "100%", height: 420 }} config={{ responsive: true, displayModeBar: true }} />
          )}
        </Section>

        {/* Class proportion */}
        <Section title="類別比例統計（這個月）">
          {!classCounts ? <div>Loading…</div> : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Plot data={[{ type: "bar", x: classCounts.labels, y: classCounts.counts, marker: { color: classCounts.colors } }]} layout={{ margin: { t: 24, r: 16, b: 80, l: 40 } }} style={{ width: "100%", height: 320 }} config={{ responsive: true }} />
              <Plot data={[{ type: "pie", labels: classCounts.labels, values: classCounts.counts, marker: { colors: classCounts.colors }, hole: 0.3 }]} layout={{ margin: { t: 24, r: 16, b: 24, l: 16 } }} style={{ width: "100%", height: 320 }} config={{ responsive: true }} />
            </div>
          )}
        </Section>

        {/* SOM maps */}
        <Section title={somTitles[somIndex] || "Self-Organizing Map"}>
          {somErr && <div className="text-red-600 text-sm mb-2">SOM load error: {somErr}</div>}
          {!somDatasets.length ? (
            <div>Loading SOM…（請在 DATA_URLS.somUrls 放入你的 GitHub raw JSON）</div>
          ) : (
            <div className="relative">
              {/* 左右切換 */}
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setSomIndex((somIndex - 1 + somDatasets.length) % somDatasets.length)}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                >
                  ←
                </button>
                <div className="text-sm text-slate-600">{somIndex + 1} / {somDatasets.length}</div>
                <button
                  onClick={() => setSomIndex((somIndex + 1) % somDatasets.length)}
                  className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
                >
                  →
                </button>
              </div>

              {/* 點點指示器 */}
              <div className="flex items-center justify-center gap-2 mb-3">
                {somDatasets.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSomIndex(i)}
                    className={`w-2.5 h-2.5 rounded-full ${i === somIndex ? "bg-blue-600" : "bg-slate-300"}`}
                    aria-label={`go to SOM ${i + 1}`}
                  />
                ))}
              </div>

              <div className="relative">
                {somDatasets.map((somArray, i) => {
                  const extraPt = somRandPts[i] ? [somRandPts[i]] : [];
                  const { traces, layout } = buildSomPlotPieMulti(
                    somArray,
                    labelColors,
                    { radius: 0.35, k: 3, showOther: true },
                    newSampleSomPosition,
                    extraPt
                  );

                  const isActive = i === somIndex;
                  return (
                    <div
                      key={i}
                      style={isActive
                        ? { width: "100%", height: 500, maxWidth: 800, margin: 'auto' }
                        : { display: 'none' }}
                    >
                        <Plot
                          data={traces}
                          layout={layout}
                          style={{ width: "100%", height: "100%" }}
                          config={{ responsive: true, displayModeBar: true }}
                          onInitialized={registerSomRef(i)}
                          onUpdate={registerSomRef(i)}
                          revision={plotRevision}
                        />
                      
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Section>
      </main>
    </div>
  );
}