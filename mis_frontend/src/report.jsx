import jsPDF from "jspdf";
import Plotly from "plotly.js-dist-min";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { useLocation, useNavigate } from "react-router-dom";

import Section from "./components/Section";
import SomPlot from "./components/SomPlot";
import TopBar from "./components/TopBar";

import useSomDatasets from "./hooks/useSomDatasets";
import useSyncedHeatmaps from "./hooks/useSyncedHeatmaps";
import useTsneAndLabels from "./hooks/useTsneAndLabels";

import heatmap from "./heatmap.png";
import heatmap_sim from "./heatmap_similar.png";


/** Palette (kept here, NOT split) */
const BASE_PALETTE = [
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

/** Data URLs (kept here, NOT split) */
const DATA_URLS = {
  labelList: "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json",
  tsnePoints: "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json",
  somUrls: [
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
    "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
  ],
};

export default function ReportPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location?.state || {};
  const searchParams = new URLSearchParams(location?.search || "");

  const incomingFilename = state.filename || searchParams.get("file") || null;
  const incomingPredLabelRaw = state.predLabel || state.predictedLabel || searchParams.get("label") || null;
  const incomingPredLabel = incomingPredLabelRaw ? String(incomingPredLabelRaw).trim() : null;

  useEffect(() => { document.title = "Analysis Report"; }, []);

  // ===== data hooks =====
  const { labelList, tsneRows, loadErr } = useTsneAndLabels({
    labelListUrl: DATA_URLS.labelList,
    tsnePointsUrl: DATA_URLS.tsnePoints,
  });
  const { somDatasets, somTitles, somErr } = useSomDatasets({ somUrls: DATA_URLS.somUrls });

  // ===== refs for PDF export =====
  const graphRefs = { family: useRef(null), heatmap: useRef(null), tsne: useRef(null) };
  const somGraphRefs = useRef([]); // filled by SomPlot via onGdRef
  const onSomGdRef = (idx, gd) => { somGraphRefs.current[idx] = gd; };

  // ===== fixed demo vars (kept) =====
  const apt30Prob = 0.00;
  const dropperProb = 0.00;
  const filename = "Dogwaffle_Install_1_2_free.exe";
  const SIMILAR_NAME = "SimpleDataBackup88.exe";

  // ===== family scores (kept) =====
  const familyScores = useMemo(() => ([
    { label: "TROJAN.GENERIC", score: 0.16 },
    { label: "ADWARE.SCREENSAVER", score: 0.22 },
    { label: "GOODWARE", score: 0.62 },
  ]), []);

  // ===== label colors =====
  const allLabelNames = useMemo(() => {
    const arr = Array.isArray(labelList) ? labelList.slice() : [];
    for (const fs of familyScores) if (!arr.includes(fs.label)) arr.push(fs.label);
    return arr;
  }, [labelList, familyScores]);
  const labelColors = useMemo(() => assignColors(allLabelNames), [allLabelNames]);

  // ===== scatter helpers =====
  const pickScatterPointForLabel = (rows, label, jitter = 0.02) => {
    if (!Array.isArray(rows) || !rows.length || !label) return null;
    const pts = rows.filter(r => String(r["true_label"] ?? r["pred_label"] ?? "other") === String(label));
    if (!pts.length) return null;
    const chosen = pts[Math.floor(Math.random() * pts.length)];
    const xs = rows.map(r => r.x), ys = rows.map(r => r.y);
    const jx = (Math.random() - 0.5) * jitter * (Math.max(...xs) - Math.min(...xs) || 1);
    const jy = (Math.random() - 0.5) * jitter * (Math.max(...ys) - Math.min(...ys) || 1);
    return { x: chosen.x + jx, y: chosen.y + jy, base: chosen };
  };
  const knnPredictScatter = (points, qx, qy, k = 7) => {
    if (!Array.isArray(points) || points.length === 0) return { label: "UNKNOWN" };
    const arr = points.map(p => ({ p, d: Math.hypot(qx - p.x, qy - p.y) })).sort((a, b) => a.d - b.d).slice(0, Math.min(k, points.length));
    const count = {}; for (const { p } of arr) { const lab = p.label || "UNKNOWN"; count[lab] = (count[lab] || 0) + 1; }
    let bestLab = "UNKNOWN", bestCnt = -1;
    for (const [lab, c] of Object.entries(count)) if (c > bestCnt) { bestCnt = c; bestLab = lab; }
    return { label: bestLab, votes: count };
  };

  // ===== SOM helpers for page logic =====
  const pickSomPointForLabel = (somArray, label, jitter = 0.25) => {
    if (!Array.isArray(somArray) || somArray.length === 0 || !label) return null;
    const candidates = somArray.map(c => ({ cell: c, p: Number((c.proportions && c.proportions[label]) || 0) })).filter(o => o.p > 0);
    if (!candidates.length) return null;
    const total = candidates.reduce((s, c) => s + c.p, 0);
    let r = Math.random() * total;
    for (const c of candidates) {
      r -= c.p;
      if (r <= 0) return { x: c.cell.col + (Math.random() - 0.5) * jitter, y: c.cell.row + (Math.random() - 0.5) * jitter };
    }
    const c = candidates[0]; return { x: c.cell.col, y: c.cell.row };
  };
  const knnPredictSom = (somArray, qx, qy, k = 5) => {
    if (!Array.isArray(somArray) || somArray.length === 0) return { label: "UNKNOWN", scores: {} };
    const eps = 1e-6;
    const distList = somArray.map(c => ({ cell: c, d: Math.hypot(qx - Number(c.col || 0), qy - Number(c.row || 0)) }))
      .sort((a, b) => a.d - b.d).slice(0, Math.min(k, somArray.length));
    const scores = {};
    for (const { cell, d } of distList) {
      const w = 1 / (d + eps);
      for (const [lab, p] of Object.entries(cell.proportions || {})) scores[lab] = (scores[lab] || 0) + w * (Number(p) || 0);
    }
    let bestLab = "UNKNOWN", bestVal = -Infinity;
    for (const [lab, s] of Object.entries(scores)) if (s > bestVal) { bestVal = s; bestLab = lab; }
    return { label: bestLab, scores };
  };

  // ===== scatter derived traces =====
  const [scatterRandPt, setScatterRandPt] = useState(null);
  const [scatterPredLabel, setScatterPredLabel] = useState(null);
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
        type: "scattergl", mode: "markers", name: lab,
        x: arr.map(d => d.x), y: arr.map(d => d.y),
        marker: { size: 4, color: labelColors[lab] },
        text: arr.map(d => `${d["true_label"] ?? "-"}`),
        hoverinfo: "text",
      };
    });
  }, [tsneRows, allLabelNames, labelColors]);

  // ===== summary JSON =====
  const summaryJson = useMemo(() => ({
    filename,
    top1_family: familyScores.reduce((a, b) => a.score >= b.score ? a : b).label,
    similar_file: SIMILAR_NAME,
    apt30: { probability: apt30Prob, is_APT30: apt30Prob >= 0.5 },
    dropper: { probability: dropperProb, is_dropper: dropperProb >= 0.5 },
  }), [filename, familyScores, SIMILAR_NAME, apt30Prob, dropperProb]);

  // ===== heatmaps syncing hook =====
  const { refs, contentW, updateContentWidth, onBarScroll, onImgScroll } = useSyncedHeatmaps();
  const { topWrapRef, bottomWrapRef, barRef, topImgRef, bottomImgRef } = refs;

  // ===== SOM UI state & page-level test points/preds =====
  const [somIndex, setSomIndex] = useState(0);
  const [somRandPts, setSomRandPts] = useState([]);
  const [somPredLabels, setSomPredLabels] = useState([]);

  // ===== derive points based on incoming params =====
  useEffect(() => {
    if (!somDatasets.length) return;

    // 一張 SOM 一個黑點
    const newSomPts = somDatasets.map((arr) => {
      const labelToUse = incomingPredLabel || incomingFilename || null;
      if (labelToUse) {
        const pt = pickSomPointForLabel(arr, labelToUse, 0.25);
        if (pt) return pt;
      }
      let maxR = 0, maxC = 0;
      for (const c of arr) {
        if (Number.isFinite(c.row)) maxR = Math.max(maxR, c.row);
        if (Number.isFinite(c.col)) maxC = Math.max(maxC, c.col);
      }
      return { x: Math.random() * (maxC || 1), y: Math.random() * (maxR || 1) };
    });
    const somLabs = newSomPts.map((pt, i) => knnPredictSom(somDatasets[i], pt.x, pt.y, 5).label);
    setSomRandPts(newSomPts);
    setSomPredLabels(somLabs);

    if (Array.isArray(tsneRows) && tsneRows.length) {
      let chosen = incomingPredLabel ? pickScatterPointForLabel(tsneRows, incomingPredLabel, 0.02) : null;
      if (!chosen) {
        const xs = tsneRows.map(r => r.x), ys = tsneRows.map(r => r.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        chosen = { x: minX + Math.random() * (maxX - minX), y: minY + Math.random() * (maxY - minY) };
      }
      setScatterRandPt(chosen);
      const points = tsneRows.map(r => ({ x: r.x, y: r.y, label: r["true_label"] ?? r["pred_label"] ?? "other" }));
      const pred = knnPredictScatter(points, chosen.x, chosen.y, 7);
      setScatterPredLabel(pred.label);
    }
  }, [somDatasets, tsneRows, incomingPredLabel, incomingFilename]);

  // ===== PDF export =====
  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pad = 48;
    doc.setFontSize(18); doc.text("Malware Report", pad, 64);
    const lines = [
      ["filename", String(summaryJson.filename)],
      ["malware family (top-1)", summaryJson.top1_family],
      ["similar attention heatmap", String(summaryJson.similar_file)],
      ["is_APT30", `${summaryJson.apt30.is_APT30} (p=${summaryJson.apt30.probability})`],
      ["is_dropper", `${summaryJson.dropper.is_dropper} (p=${summaryJson.dropper.probability})`],
    ];
    let y = 120; doc.setTextColor(20); doc.setFontSize(12);
    lines.forEach((row, i) => { doc.text(`${row[0]}:`, pad, y + i * 20); doc.text(String(row[1]), pad + 160, y + i * 20); });

    const items = [{ key: "tsne", title: "t-SNE embedding" }];
    y = 220;
    for (const it of items) {
      const gd = graphRefs[it.key].current; if (!gd) continue;
      doc.setFontSize(12); doc.setTextColor(20); doc.text(it.title, pad, y); y += 14;
      try {
        const exportWidth = 720, exportHeight = 480;
        const displayWidth = 520, displayHeight = 440;
        const img = await Plotly.toImage(gd, { format: "png", width: exportWidth, height: exportHeight, scale: 2 });
        if (y + displayHeight > 780) { doc.addPage(); y = 64; }
        doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
        y += displayHeight + 16;
      } catch {}
    }

    if (somGraphRefs.current && somGraphRefs.current.length) {
      doc.addPage(); y = 64;
      doc.setFontSize(14); doc.setTextColor(20); doc.text("Self-Organizing Maps", pad, y); y += 20;
      for (let i = 0; i < somGraphRefs.current.length; i++) {
        const gd = somGraphRefs.current[i]; if (!gd) continue;
        const t = somTitles?.[i] || `SOM #${i + 1}`;
        doc.setFontSize(12); doc.setTextColor(20); doc.text(t, pad, y); y += 14;
        try {
          const exportWidth = 720, exportHeight = 480;
          const displayWidth = 520, displayHeight = 440;
          const img = await Plotly.toImage(gd, { format: "png", width: exportWidth, height: exportHeight, scale: 2 });
          if (y + displayHeight > 780) { doc.addPage(); y = 64; }
          doc.addImage(img, "PNG", pad, y, displayWidth, displayHeight);
          y += displayHeight + 16;
        } catch {}
      }
    }
    const blob = doc.output("blob");
    const blobUrl = URL.createObjectURL(blob);
    window.open(blobUrl, "_blank");
  };

  const [copied, setCopied] = useState(false);
  const handleCopy = () => { navigator.clipboard.writeText(JSON.stringify(summaryJson, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <div className="text-slate-700"><span className="text-lg font-semibold">Analysis results</span></div>
          <div className="flex gap-3">
            <button onClick={() => navigate("/")} className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Back to Main</button>
            <button onClick={handlePDF} className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Export PDF</button>
          </div>
        </div>

        {/* 1) t-SNE */}
        <Section title="t-SNE embedding" subtitle={`label = ${summaryJson.top1_family}`}>
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!tsneRows ? <div>Loading…</div> : (
            <Plot
              data={[
                ...tsneTraces,
                ...(scatterRandPt ? [{
                  type: "scattergl", mode: "markers",
                  x: [scatterRandPt.x], y: [scatterRandPt.y],
                  marker: { size: 10, color: "black" },
                  name: "test point", showlegend: false, hoverinfo: "skip",
                }] : [])
              ]}
              layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h" } }}
              style={{ width: "100%", height: 360 }}
              config={{ responsive: true, displayModeBar: true }}
              onInitialized={(fig, gd) => { graphRefs.tsne.current = gd; }}
              onUpdate={(fig, gd) => { graphRefs.tsne.current = gd; }}
            />
          )}
        </Section>

        {/* 2) Attention heatmaps（同步捲動） */}
        <Section title="attention heatmaps">
          <div className="flex flex-col gap-3">
            <div className="text-xs font-medium text-slate-700">Attention heatmap of this file</div>
            <div ref={topWrapRef} className="relative w-full h-50 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white" onScroll={onImgScroll}>
              <div style={{ width: contentW }}>
                <img ref={topImgRef} src={heatmap} alt="attention heatmap (top)" className="block max-w-none" onLoad={updateContentWidth} />
              </div>
            </div>

            <div className="text-xs font-medium text-slate-700">
              The most similar attention heatmap : file <span className="font-semibold">"{SIMILAR_NAME}"</span>
            </div>
            <div ref={bottomWrapRef} className="relative w-full h-50 overflow-x-hidden overflow-y-auto rounded-xl border border-slate-200 bg-white" onScroll={onImgScroll}>
              <div style={{ width: contentW }}>
                <img ref={bottomImgRef} src={heatmap_sim} alt="attention heatmap (bottom)" className="block max-w-none" onLoad={updateContentWidth} />
              </div>
            </div>

            <div ref={barRef} className="overflow-x-auto overflow-y-hidden rounded-lg border border-slate-200 bg-slate-50 h-5" onScroll={onBarScroll} aria-label="Horizontal scroller for both heatmaps">
              <div style={{ width: contentW, height: 0.5 }} />
            </div>
          </div>
        </Section>

        {/* 3) SOM maps */}
        <Section
          title={somTitles[somIndex] || "Self-Organizing Map"}
          subtitle={
            somIndex === 0 ? "This file is not attributed to APT30."
              : somIndex === 1 ? "This file is not classified as a dropper." : ""
          }
        >
          {somErr && <div className="text-red-600 text-sm mb-2">SOM load error: {somErr}</div>}
          {!somDatasets.length ? (
            <div>Loading SOM…（請在 DATA_URLS.somUrls 放入你的 GitHub raw JSON）</div>
          ) : (
            <SomPlot
              somDatasets={somDatasets}
              somIndex={somIndex}
              setSomIndex={setSomIndex}
              labelColors={labelColors}
              testPoints={somRandPts}
              onGdRef={onSomGdRef}
            />
          )}
        </Section>

        {/* 4) JSON summary */}
        <Section title="json data of this file">
          <div className="p-2 bg-slate-50 rounded-xl">
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(summaryJson, null, 2)}</pre>
            <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(summaryJson, null, 2)); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className={`mt-2 px-3 py-1 text-xs rounded transition-colors ${copied ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
              {copied ? "JSON copied" : "Copy JSON"}
            </button>
          </div>
        </Section>
      </main>
    </div>
  );
}
