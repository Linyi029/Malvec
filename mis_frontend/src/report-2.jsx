import jsPDF from "jspdf";
import Plotly from "plotly.js-dist-min";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { useLocation, useNavigate } from "react-router-dom";
// 移除了靜態 heatmap import:
// import heatmap from "./heatmap.png";
// import heatmap_sim from "./heatmap_similar.png";

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

/** GitHub raw JSON URLs (from report(1)) */
const DATA_URLS = {
  labelList:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json",
  tsnePoints:
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json",
  somUrls: [ // (from report(1))
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
  ],
};

// ✨ (from report.jsx) 統一 heatmap 資料處理邏輯
function normalizeHeatmap(data) {
  if (!data) return null;
  let val = data;

  if (typeof val === "object") {
    val = val.attention_heatmap || val.similar_heatmap_image || null;
  }

  if (typeof val === "string" && val.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(val);
      val = parsed.attention_heatmap || parsed.similar_heatmap_image || val;
    } catch {}
  }

  if (typeof val === "string" && val.startsWith("data%3A")) {
    val = decodeURIComponent(val);
  }

  return val;
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

export default function ReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location?.state || {};
  const searchParams = new URLSearchParams(location?.search || "");

  // ✨ (from report.jsx) heatmap normalization
  const heatmapData = normalizeHeatmap(state.attention_heatmap);
  const similarHeatmap = normalizeHeatmap(state.similar_heatmap_image);

  console.log("[report] decoded heatmap starts with:", heatmapData?.slice(0, 80));
  console.log("[report] similar heatmap starts with:", similarHeatmap?.slice(0, 80));

  // (from report(1))
  const [newSamplePoint, setNewSamplePoint] = useState(null);
  const [newSampleSomPosition, setNewSampleSomPosition] = useState(null);

  // (from report(1))
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

  // (from report(1))
  const incomingFilename = state.filename || searchParams.get("file") || "unknown.exe";
  const incomingPredLabelRaw = state.predLabel || state.predictedLabel || searchParams.get("label") || null;
  const incomingPredLabel = incomingPredLabelRaw ? String(incomingPredLabelRaw).trim() : null;

  console.log("[report] incomingFilename:", incomingFilename, "incomingPredLabel:", incomingPredLabel);

  useEffect(() => { document.title = "Analysis Report"; }, []);

  // (from report(1))
  const graphRefs = { family: useRef(null), apt30: useRef(null), tsne: useRef(null) };
  // 移除了 apt30Prob, dropperProb, SIMILAR_NAME (它們將來自 somAnalysisFromState)

  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  // (from report(1))
  const familyScores = useMemo(
    () => [
      { label: "TROJAN.GENERIC", score: 0.16 },
      { label: "ADWARE.SCREENSAVER", score: 0.22 },
      { label: "GOODWARE", score: 0.62 },
    ],
    []
  );

  // (from report(1))
  useEffect(() => {
    (async () => {
      try {
        if (!DATA_URLS.labelList || !DATA_URLS.tsnePoints) return;
        const [labelsRes, pointsRes] = await Promise.all([
          fetch(DATA_URLS.labelList), 
          fetch(DATA_URLS.tsnePoints)
        ]);
        if (!labelsRes.ok) throw new Error(`labelList HTTP ${labelsRes.status}`);
        if (!pointsRes.ok) throw new Error(`tsnePoints HTTP ${pointsRes.status}`);
        const [labels, points] = await Promise.all([labelsRes.json(), pointsRes.json()]);
        setLabelList(labels);
        setTsneRows(points);
      } catch (e) { 
        setLoadErr(String(e)); 
      }
    })();
  }, []);

  // (from report(1)) - 保留前端 t-SNE 計算邏輯
  useEffect(() => {
    if (!tsneRows || !incomingPredLabel) {
      setNewSamplePoint(null);
      return;
    }
    
    console.log("[report] Calculating position for label:", incomingPredLabel);
    
    const labelPoints = tsneRows.filter(r => {
      const lab = String(r["true_label"] || r["pred_label"] || "").trim().toUpperCase();
      return lab === incomingPredLabel.toUpperCase();
    });
    
    if (labelPoints.length === 0) {
      console.warn(`⚠️ No points found for label: ${incomingPredLabel}`);
      setNewSamplePoint(null);
      return;
    }

    const centerX = labelPoints.reduce((sum, p) => sum + p.x, 0) / labelPoints.length;
    const centerY = labelPoints.reduce((sum, p) => sum + p.y, 0) / labelPoints.length;
    const jitterX = (Math.random() - 0.5) * 0.5;
    const jitterY = (Math.random() - 0.5) * 0.5;
    
    const position = {
      x: centerX + jitterX,
      y: centerY + jitterY,
      label: incomingPredLabel,
      pointCount: labelPoints.length,
      method: "centroid"
    };
    
    setNewSamplePoint(position);
    
    console.log(`✅ Position calculated:`, {
      label: incomingPredLabel,
      position: `(${position.x.toFixed(2)}, ${position.y.toFixed(2)})`,
      basedOn: `${labelPoints.length} existing points`
    });
  }, [tsneRows, incomingPredLabel]);

   // (from report(1)) - 保留 SOM 位置解析
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

  // (from report(1))
  const allLabelNames = useMemo(() => {
    const arr = Array.isArray(labelList) ? labelList.slice() : [];
    for (const fs of familyScores) if (!arr.includes(fs.label)) arr.push(fs.label);
    return arr;
  }, [labelList, familyScores]);

  const labelColors = useMemo(() => assignColors(allLabelNames), [allLabelNames]);

  // (from report(1))
  const tsneTraces = useMemo(() => {
    if (!tsneRows) return [];
    const by = new Map();
    tsneRows.forEach((r) => {
      const k = r["true_label"] ?? r["pred_label"] ?? "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    });
    const order = allLabelNames.length ? allLabelNames : Array.from(by.keys());
    return order.filter(l => by.has(l)).map(lab => {
      const arr = by.get(lab);
      return {
        type: "scattergl", 
        mode: "markers", 
        name: lab,
        x: arr.map(d => d.x), 
        y: arr.map(d => d.y),
        marker: { size: 4, color: labelColors[lab] },
        text: arr.map(d => `${d["true_label"] ?? "-"}`),
        hoverinfo: "text",
      };
    });
  }, [tsneRows, allLabelNames, labelColors]);

  // ✨ (整合) 更新 summaryJson 以使用來自 state 的動態 heatmap data
  const summaryJson = useMemo(() => {
    // (from report(1))
    const fp = somAnalysisFromState?.feature_probabilities
      || somAnalysisFromState?.features_probability
      || somAnalysisFromState?.features
      || {};
    const somPos = somAnalysisFromState?.winner_position
      || somAnalysisFromState?.position
      || null;
  
    return {
      filename: incomingFilename,
      top1_family: incomingPredLabel || familyScores.reduce((a, b) => (a.score >= b.score ? a : b)).label,
      
      // ✨ (from report.jsx logic)
      similar_file: state.most_similar_in_label || null,
      similarity_score: state.similarity_score || null,
  
      // (from report(1))
      apt30: {
        probability: Number(fp.APT30 || 0),
        is_APT30: Number(fp.APT30 || 0) >= 0.2,
      },
      dropper: {
        probability: Number(fp.dropper || 0),
        is_dropper: Number(fp.dropper || 0) >= 0.2,
      },
      som_position: somPos && typeof somPos.row === 'number' && typeof somPos.col === 'number'
        ? { row: somPos.row, col: somPos.col }
        : null,
    };
  // ✨ (整合) 更新 dependencies
  }, [incomingFilename, incomingPredLabel, familyScores, somAnalysisFromState, state.most_similar_in_label, state.similarity_score]);

  // (from report(1))
  const SectionCard = ({ title, subtitle, children }) => (
    <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
        <h3 className="text-slate-800 font-semibold">{title}</h3>
        <div className="text-sm text-slate-600 text-right">{subtitle}</div>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );

  // (from report(1)) - 保留 SOM 相關 state
  const [somDatasets, setSomDatasets] = useState([]);
  const [somTitles, setSomTitles] = useState([]);
  const [somErr, setSomErr] = useState("");
  const [somIndex, setSomIndex] = useState(0);
  const somGraphRefs = useRef([]);
  somGraphRefs.current = [];

  const registerSomRef = (idx) => (fig, gd) => { somGraphRefs.current[idx] = gd; };

  // (from report(1)) - 保留 SOM 輔助函數
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

  // (from report(1)) - 保留 SOM 數據獲取
  useEffect(() => {
    (async () => {
      if (!DATA_URLS.somUrls || !DATA_URLS.somUrls.length) return;
      try {
        const resps = await Promise.all(
          DATA_URLS.somUrls.map(u => fetch(u, { cache: "no-store" }))
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
          console.log(`[SOM] dataset #${i} normalized length:`, arr.length);
          if (arr.length) console.log(`[SOM] sample[${i}]:`, arr.slice(0, 2));
          return arr;
        });
        const titles = ['SOM-APT30', 'SOM-dropper'];
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

  // (from report(1)) - 保留 SOM 繪圖函數
  function buildSomPlotPieMulti(somArray, labelColorsFromAll, opts = {}, newSamplePos = null) {
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
          fillcolor: lab === OTHER_KEY ? "#e5e7eb" : (labelColorsFromAll[lab] || "#7f7f7f"),
          layer: "below",
          opacity: 0.98,
        });
      }
    }
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
        fillcolor: "white",
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
        line: { width: 2, color: "white" },
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
    return {
      traces: [baseTrace, ...legendTraces],
      layout
    };
  }

  // 移除了 heatmap scroller 相關的 state, ref 和 callback

  // (from report(1)) - 保留 PDF 匯出邏輯
  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pad = 48;
    doc.setFontSize(18); 
    doc.text("Malware Report", pad, 64);
    
    // ✨ (整合) 使用更新後的 summaryJson
    const lines = [
      ["filename", String(summaryJson.filename)],
      ["malware family (top-1)", summaryJson.top1_family],
      ["similar attention heatmap", String(summaryJson.similar_file)], // (現在是動態的)
      ["similarity_score", String(summaryJson.similarity_score?.toFixed(4) || "N/A")], // ✨ (新增)
      ["is_APT30", `${summaryJson.apt30.is_APT30} (p=${summaryJson.apt30.probability.toFixed(4)})`],
      ["is_dropper", `${summaryJson.dropper.is_dropper} (p=${summaryJson.dropper.probability.toFixed(4)})`],
    ];
    
    const y0 = 120; 
    doc.setTextColor(20); 
    doc.setFontSize(12);
    lines.forEach((row, i) => { 
      doc.text(`${row[0]}:`, pad, y0 + i * 20); 
      doc.text(String(row[1]), pad + 160, y0 + i * 20); 
    });

    const items = [
      { key: "tsne", title: "t-SNE embedding" },
    ];

    let y = y0 + lines.length * 20 + 20; // 動態計算 y
    for (const it of items) {
      const gd = graphRefs[it.key].current;
      if (!gd) continue;
      doc.setFontSize(12); 
      doc.setTextColor(20); 
      doc.text(it.title, pad, y); 
      y += 14;
      try {
        const exportWidth = 720, exportHeight = 480;
        const displayWidth = 520, displayHeight = 440;
        const img = await Plotly.toImage(gd, { 
          format: "png", 
          width: exportWidth, 
          height: exportHeight, 
          scale: 2 
        });
        if (y + displayHeight > 780) { 
          doc.addPage(); 
          y = 64; 
        }
        doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
        y += displayHeight + 16;
      } catch (e) {
        console.error("Error exporting chart:", e);
      }
    }

    // (from report(1)) - 保留 SOM 匯出
    if (somGraphRefs.current && somGraphRefs.current.length) {
      doc.addPage();
      y = 64;
      doc.setFontSize(14); 
      doc.setTextColor(20); 
      doc.text("Self-Organizing Maps", pad, y); 
      y += 20;

      for (let i = 0; i < somGraphRefs.current.length; i++) {
        const gd = somGraphRefs.current[i];
        if (!gd) continue;
        const t = somTitles?.[i] || `SOM #${i + 1}`;
        doc.setFontSize(12); 
        doc.setTextColor(20); 
        doc.text(t, pad, y); 
        y += 14;
        try {
          const exportWidth = 720, exportHeight = 480;
          const displayWidth = 520, displayHeight = 440;
          const img = await Plotly.toImage(gd, { 
            format: "png", 
            width: exportWidth, 
            height: exportHeight, 
            scale: 2 
          });
          if (y + displayHeight > 780) { 
            doc.addPage(); 
            y = 64; 
          }
          doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
          y += displayHeight + 16;
        } catch (e) {
          console.error("Error exporting SOM:", e);
        }
      }
    }
    
    // ✨ (新增) 嘗試匯出動態 heatmap
    if (heatmapData || similarHeatmap) {
      doc.addPage();
      y = 64;
      doc.setFontSize(14); 
      doc.setTextColor(20); 
      doc.text("Attention Heatmaps", pad, y);
      y += 20;

      if (heatmapData) {
        doc.setFontSize(12);
        doc.text("Attention heatmap of this file", pad, y);
        y += 14;
        try {
          doc.addImage(heatmapData, "PNG", pad, y, 520, 100); // 假設高度
          y += 100 + 16;
        } catch(e) { console.error("Failed to add heatmap to PDF:", e); }
      }
      
      if (similarHeatmap) {
        doc.setFontSize(12);
        doc.text(`Most similar heatmap: ${summaryJson.similar_file || 'N/A'}`, pad, y);
        y += 14;
        try {
          doc.addImage(similarHeatmap, "PNG", pad, y, 520, 100); // 假設高度
          y += 100 + 16;
        } catch(e) { console.error("Failed to add similar heatmap to PDF:", e); }
      }
    }

    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  // (from report(1))
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(summaryJson, null, 2));
    setCopied(true); 
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-700">
            <span className="text-lg font-semibold">Analysis results</span>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={() => navigate("/")} 
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50"
            >
              Back to Main
            </button>
            <button 
              onClick={handlePDF} 
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50"
            >
              Export PDF
            </button>
          </div>
        </div>

        {/* (from report(1)) - 1. t-SNE embedding with new sample */}
        <SectionCard 
          title="t-SNE embedding" 
          subtitle={`File: ${incomingFilename} | Predicted: ${incomingPredLabel || 'N/A'}`}
        >
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!tsneRows ? (
            <div>Loading…</div>
          ) : (
            <Plot
              data={[
                ...tsneTraces,
                ...(newSamplePoint ? [{
                  type: "scattergl",
                  mode: "markers",
                  x: [newSamplePoint.x],
                  y: [newSamplePoint.y],
                  marker: { 
                    size: 14, 
                    color: "black",
                    symbol: "circle",
                    line: { width: 3, color: "white" }
                  },
                  name: "New Sample",
                  showlegend: true,
                  hovertemplate: 
                    `<b>🆕 New Sample</b><br>` +
                    `File: ${incomingFilename}<br>` +
                    `Predicted: ${incomingPredLabel || "N/A"}<br>` +
                    `Position: (${newSamplePoint.x.toFixed(2)}, ${newSamplePoint.y.toFixed(2)})<br>` +
                    `Method: Centroid of ${newSamplePoint.pointCount} ${incomingPredLabel} samples<br>` +
                    `<extra></extra>`
                }] : [])
              ]}
              layout={{ 
                margin: { t: 24, r: 16, b: 40, l: 40 }, 
                legend: { orientation: "h", y: -0.15 },
                hovermode: "closest"
              }}
              style={{ width: "100%", height: 400 }}
              config={{ responsive: true, displayModeBar: true }}
              onInitialized={(fig, gd) => { graphRefs.tsne.current = gd; }}
              onUpdate={(fig, gd) => { graphRefs.tsne.current = gd; }}
            />
          )}
          
          {newSamplePoint && (
            <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
              <div className="font-semibold text-slate-700 mb-2">📍 Sample Position:</div>
              <div className="grid grid-cols-2 gap-2 text-slate-600">
                <div>Predicted Label: {newSamplePoint.label}</div>
                <div>Position: ({newSamplePoint.x.toFixed(2)}, {newSamplePoint.y.toFixed(2)})</div>
                <div className="col-span-2 text-xs text-slate-500">
                  Positioned at the centroid of {newSamplePoint.pointCount} existing {newSamplePoint.label} samples
                </div>
              </div>
            </div>
          )}
        </SectionCard>

        {/* ✨ (from report.jsx) - 2. DYNAMIC attention heatmaps */}
        <SectionCard title="attention heatmaps">
          <div className="p-4 flex flex-col gap-4">
            {/* 主 heatmap */}
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Attention heatmap of this file
              </div>
              {typeof heatmapData === "string" && heatmapData.startsWith("data:image") ? (
                <img
                  src={heatmapData}
                  alt="attention heatmap"
                  className="block w-full max-w-none rounded-lg border"
                />
              ) : (
                <div className="p-4 text-sm text-slate-500 bg-slate-50 rounded-lg border">
                  No attention heatmap data available.
                </div>
              )}
            </div>

            {/* 相似 heatmap */}
            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">
                Most similar attention heatmap
                {/* ✨ (from report.jsx) 使用 state 顯示檔名 */}
                <b className="ml-1">{state.most_similar_in_label || "N/A"}</b>
                {/* ✨ (from report.jsx) 使用 state 顯示分數 */}
                {state.similarity_score && (
                  <span className="ml-1 text-slate-500 text-xs">
                    (similarity {state.similarity_score.toFixed(3)})
                  </span>
                )}
              </div>

              {typeof similarHeatmap === "string" && similarHeatmap.startsWith("data:image") ? (
                <img
                  src={similarHeatmap}
                  alt="similar attention heatmap"
                  className="block w-full max-w-none rounded-lg border"
                />
              ) : (
                <div className="p-4 text-sm text-slate-500 bg-slate-50 rounded-lg border">
                  No similar attention heatmap data available.
                </div>
              )}
            </div>
          </div>
        </SectionCard>


        {/* (from report(1)) - 3. SOM maps */}
        <SectionCard 
          title={somTitles[somIndex] || "Self-Organizing Map"}
          subtitle={
            somIndex === 0
              ? (summaryJson.apt30.is_APT30
                  ? "This file is attributed to APT30."
                  : "This file is not attributed to APT30.")
              : somIndex === 1
              ? (summaryJson.dropper.is_dropper
                  ? "This file is classified as a dropper."
                  : "This file is not classified as a dropper.")
              : ""
          }
        >
          {somErr && <div className="text-red-600 text-sm mb-2">SOM load error: {somErr}</div>}
          {!somDatasets.length ? (
            <div>Loading SOM…</div>
          ) : (
            <div className="relative">
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

              <div className="relative justify-center items-center">
                {somDatasets.map((somArray, i) => {
                  const { traces, layout } = buildSomPlotPieMulti(
                    somArray,
                    labelColors,
                    { radius: 0.35, k: 3, showOther: true },
                    newSampleSomPosition
                  );

                  const isActive = i === somIndex;
                  return (
                    <div
                      key={i}
                      style={isActive
                        ? { width: "100%", height: 500 }
                        : { position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }}
                    >
                      <div style={{ width: '100%', maxWidth: 800, aspectRatio: '1 / 1' }}>
                        <Plot
                          data={traces}
                          layout={layout}
                          style={isActive ? { width: "100%", height: 500 } : { width: 1, height: 1 }}
                          config={{ responsive: true, displayModeBar: true }}
                          onInitialized={registerSomRef(i)}
                          onUpdate={registerSomRef(i)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {newSampleSomPosition && (
                <div className="mt-4 p-3 bg-slate-50 rounded-lg text-sm">
                  <div className="font-semibold text-slate-700 mb-2">📍 Sample Position on SOM:</div>
                  <div className="grid grid-cols-2 gap-2 text-slate-600">
                    <div>Row: {newSampleSomPosition.row}</div>
                    <div>Col: {newSampleSomPosition.col}</div>
                    <div className="col-span-2 text-xs text-slate-500">
                      The black dot ⚫ marks your file's position on the SOM map
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {/* (from report(1)) - 4. json summary */}
        <SectionCard title="json data of this file">
          <div className="p-2 bg-slate-50 rounded-xl">
            <pre className="text-xs whitespace-pre-wrap">
              {JSON.stringify(summaryJson, null, 2)}
            </pre>
            <button 
              onClick={handleCopy} 
              className={`mt-2 px-3 py-1 text-xs rounded transition-colors ${
                copied ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"
              }`}
            >
              {copied ? "JSON copied" : "Copy JSON"}
            </button>
          </div>
        </SectionCard>
      </main>
    </div>
  );
}