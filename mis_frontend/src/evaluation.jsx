import React, { useEffect, useMemo, useState } from "react";
import Plot from "react-plotly.js";
import RangeBar from "./components/RangeBar";
import Section from "./components/Section";
import SomPlot from "./components/SomPlot";
import TopBar from "./components/TopBar";

import useEmbeddingsAndLabels from "./hooks/useEmbeddingsAndLabels";
import useSomDatasets from "./hooks/useSomDatasets";


// ========== Constants (仍集中於此：未拆 color.js / data.js) ==========
/** GitHub raw JSON URLs (fill these) */
const EMBEDDING_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/data_w_time_finetuned_cut.json";
const LABEL_LIST_URL = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json";
const somUrls = [
  "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_APT30.json",
  "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/som_dropper.json",
];

/** Palette (provided) */
const BASE_PALETTE = [
  "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
  "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];

// ========== Utilities（保留原有行為） ==========
const assignColors = (labels) => {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
};
const tsToDateStr = (ts) => {
  const n = Number(ts);
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? String(ts) : d.toISOString().slice(0, 10);
};

// ========== Components ==========

export default function EvaluationPage() {
  useEffect(() => { document.title = "Periodic Evaluation"; }, []);

  // 讀 labelList + embedding points；回傳派生的時間範圍
  const {
    labelList, allPoints, loadErr,
    timeMin, timeMax, selMin, selMax,
    setSelMin, setSelMax,
  } = useEmbeddingsAndLabels({ LABEL_LIST_URL, EMBEDDING_URL });

  // SOM 載入與正規化
  const {
    somDatasets, somTitles, somErr,
  } = useSomDatasets({ somUrls });

  // 顏色表
  const labelColors = useMemo(() => {
    if (!labelList) return {};
    const uniq = Array.isArray(labelList) ? Array.from(new Set(labelList)).filter(Boolean) : [];
    return assignColors(uniq);
  }, [labelList]);

  // 過濾時間區間
  const filteredPoints = useMemo(() => {
    if (!allPoints) return null;
    const lo = Math.max(timeMin, Math.min(selMin, selMax));
    const hi = Math.min(timeMax, Math.max(selMin, selMax));
    return allPoints.filter(r => {
      const t = Number(r["time_period"]) || 0;
      return t >= lo && t <= hi;
    });
  }, [allPoints, timeMin, timeMax, selMin, selMax]);

  // Embedding traces（維持原本行為）
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
        text: arr.map(d => {
          const lab = d["pred_label"] ?? "-";
          return `${lab}${d.time_period ? `<br>${tsToDateStr(d.time_period)}` : ""}`;
        })
      };
    });
  }, [filteredPoints, labelList, labelColors]);

  // 類別統計（維持原有行為）
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

  const rangeInfo = useMemo(() => {
    if (!allPoints || !filteredPoints) return null;
    const total = allPoints.length;
    const sel = filteredPoints.length;
    const pct = total ? Math.round((sel / total) * 100) : 0;
    return { sel, total, pct };
  }, [allPoints, filteredPoints]);

  // SOM 索引 & 測試點（維持原有的狀態）
  const [somIndex, setSomIndex] = useState(0);
  const [somRandPts, setSomRandPts] = useState([]);   // 依舊保留介面：每張 SOM 一個 {x,y}
  const [somPredLabels, setSomPredLabels] = useState([]); // 若你後續要顯示預測結果可用

  // 輸入框 commit
  const commitMin = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMin(Math.max(timeMin, Math.min(n, selMax))); };
  const commitMax = (v) => { const n = Number(v); if (!Number.isNaN(n)) setSelMax(Math.min(timeMax, Math.max(n, selMin))); };

  return (
    <div className="min-h-screen">
      <TopBar />

      {/* Filters（保留原本 UI） */}
      <div className="sticky top-[56px] z-40 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto max-w-6xl px-4 py-4">
          <div className="border border-slate-200 rounded-2xl bg-white shadow-sm p-4">
            <div className="flex items-center gap-4">
              <div className="flex flex-col w-32">
                <label className="text-xs text-slate-500 mb-1">下限 (first_submission_date)</label>
                <input
                  type="number"
                  min={timeMin}
                  max={selMax}
                  value={selMin}
                  onChange={(e) => commitMin(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </div>

              <div className="flex-1">
                <RangeBar
                  min={timeMin}
                  max={timeMax}
                  valueMin={selMin}
                  valueMax={selMax}
                  onChange={({ min, max }) => { setSelMin(min); setSelMax(max); }}
                />
                <div className="mt-1 text-xs text-slate-600">
                  {rangeInfo
                    ? `選取 ${tsToDateStr(selMin)} ~ ${tsToDateStr(selMax)}（${rangeInfo.sel}/${rangeInfo.total}, 約 ${rangeInfo.pct}%）`
                    : "讀取中…"}
                </div>
              </div>

              <div className="flex flex-col w-32">
                <label className="text-xs text-slate-500 mb-1">上限 (first_submission_date)</label>
                <input
                  type="number"
                  min={selMin}
                  max={timeMax}
                  value={selMax}
                  onChange={(e) => commitMax(e.target.value)}
                  className="border rounded px-2 py-1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* 1) Embedding */}
        <Section title="Embedding 降維圖（本月新增 & 完成分析）">
          {loadErr && <div className="text-red-600 text-sm mb-2">Load error: {loadErr}</div>}
          {!filteredPoints
            ? <div>Loading…</div>
            : (
              <Plot
                data={embeddingTraces}
                layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h" } }}
                style={{ width: "100%", height: 420 }}
                config={{ responsive: true, displayModeBar: true }}
              />
            )}
        </Section>

        {/* 2) Class proportion */}
        <Section title="類別比例統計（這個月）">
          {!classCounts
            ? <div>Loading…</div>
            : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Plot
                  data={[{ type: "bar", x: classCounts.labels, y: classCounts.counts, marker: { color: classCounts.colors } }]}
                  layout={{ margin: { t: 24, r: 16, b: 80, l: 40 } }}
                  style={{ width: "100%", height: 320 }}
                  config={{ responsive: true }}
                />
                <Plot
                  data={[{ type: "pie", labels: classCounts.labels, values: classCounts.counts, marker: { colors: classCounts.colors }, hole: 0.3 }]}
                  layout={{ margin: { t: 24, r: 16, b: 24, l: 16 } }}
                  style={{ width: "100%", height: 320 }}
                  config={{ responsive: true }}
                />
              </div>
            )}
        </Section>

        {/* 3) SOM maps（改由 SomPlot 元件承載，邏輯與輸出維持） */}
        <Section title={somTitles[somIndex] || "Self-Organizing Map"}>
          {somErr && <div className="text-red-600 text-sm mb-2">SOM load error: {somErr}</div>}
          {!somDatasets.length ? (
            <div>Loading SOM…（請在 somUrls 放入你的 GitHub raw JSON）</div>
          ) : (
            <SomPlot
              somDatasets={somDatasets}
              somIndex={somIndex}
              setSomIndex={setSomIndex}
              labelColors={labelColors}
              testPoints={somRandPts}         // 保留 test point 介面
              setTestPoints={setSomRandPts}
            />
          )}
        </Section>
      </main>
    </div>
  );
}
