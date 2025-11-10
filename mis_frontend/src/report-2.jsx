import jsPDF from "jspdf";
import Plotly from "plotly.js-dist-min";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Plot from "react-plotly.js";
import { useLocation, useNavigate } from "react-router-dom";
import heatmap_sim from "./heatmap_similar.png";

const BASE_PALETTE = [
  "#1f77b4", "#f4b37a", "#63c063", "#d62728", "#9467bd",
  "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
  "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
  "#3182bd", "#406d4d", "#756bb1", "#636363", "#b9450b",
];

function assignColors(labels) {
  const map = {};
  labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
  return map;
}

const DATA_URLS = {
  labelList: "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json",
  tsnePoints: "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/tsne_extracols.json",
};

// 🧩 統一 heatmap 資料處理邏輯
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
        <div className="text-lg font-semibold text-slate-800"><a href="/">Malvec</a></div>
        <ul className="flex items-center gap-6 text-slate-700">
          <li><a href="#about" className="hover:text-blue-500">About</a></li>
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

  // === heatmap normalization ===
  const heatmapData = normalizeHeatmap(state.attention_heatmap);
  const similarHeatmap = normalizeHeatmap(state.similar_heatmap_image);

  console.log("[report] decoded heatmap starts with:", heatmapData?.slice(0, 80));
  console.log("[report] similar heatmap starts with:", similarHeatmap?.slice(0, 80));

  const searchParams = new URLSearchParams(location?.search || "");
  const [newSamplePoint, setNewSamplePoint] = useState(null);

  const incomingFilename = state.filename || searchParams.get("file") || "unknown.exe";
  const incomingPredLabelRaw = state.predLabel || state.predictedLabel || searchParams.get("label");
  const incomingPredLabel = incomingPredLabelRaw ? String(incomingPredLabelRaw).trim() : null;

  useEffect(() => { document.title = "Analysis Report"; }, []);

  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const graphRefs = { tsne: useRef(null) };

  useEffect(() => {
    (async () => {
      try {
        const [labelsRes, pointsRes] = await Promise.all([
          fetch(DATA_URLS.labelList),
          fetch(DATA_URLS.tsnePoints),
        ]);
        if (!labelsRes.ok || !pointsRes.ok) throw new Error("Fetch error");
        const [labels, points] = await Promise.all([labelsRes.json(), pointsRes.json()]);
        setLabelList(labels);
        setTsneRows(points);
      } catch (e) { setLoadErr(String(e)); }
    })();
  }, []);

  useEffect(() => {
    if (!tsneRows || !incomingPredLabel) return;
    const labelPoints = tsneRows.filter(r => {
      const lab = String(r["true_label"] || r["pred_label"] || "").trim().toUpperCase();
      return lab === incomingPredLabel.toUpperCase();
    });
    if (labelPoints.length === 0) return;
    const cx = labelPoints.reduce((s, p) => s + p.x, 0) / labelPoints.length;
    const cy = labelPoints.reduce((s, p) => s + p.y, 0) / labelPoints.length;
    setNewSamplePoint({ x: cx, y: cy, label: incomingPredLabel });
  }, [tsneRows, incomingPredLabel]);

  const allLabels = useMemo(() => labelList || [], [labelList]);
  const labelColors = useMemo(() => assignColors(allLabels), [allLabels]);

  const tsneTraces = useMemo(() => {
    if (!tsneRows) return [];
    const by = new Map();
    tsneRows.forEach(r => {
      const k = r["true_label"] ?? r["pred_label"] ?? "other";
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    });
    return Array.from(by.keys()).map(lab => ({
      type: "scattergl", mode: "markers", name: lab,
      x: by.get(lab).map(d => d.x), y: by.get(lab).map(d => d.y),
      marker: { size: 4, color: labelColors[lab] },
    }));
  }, [tsneRows, labelColors]);

  const summaryJson = useMemo(() => ({
    filename: incomingFilename,
    top1_family: incomingPredLabel || "UNKNOWN",
  }), [incomingFilename, incomingPredLabel]);

  const graphRef = useRef(null);

  const handlePDF = async () => {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    doc.setFontSize(18);
    doc.text("Malware Report", 48, 64);
    const lines = [
      ["Filename", summaryJson.filename],
      ["Predicted Family", summaryJson.top1_family],
    ];
    lines.forEach((r, i) => {
      doc.text(`${r[0]}:`, 48, 120 + i * 20);
      doc.text(String(r[1]), 200, 120 + i * 20);
    });
    const gd = graphRef.current;
    if (gd) {
      const img = await Plotly.toImage(gd, { format: "png", width: 720, height: 480 });
      doc.addImage(img, "PNG", 48, 240, 480, 400);
    }
    window.open(URL.createObjectURL(doc.output("blob")), "_blank");
  };

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
          <h2 className="text-lg font-semibold text-slate-700">Analysis Results</h2>
          <div className="flex gap-3">
            <button onClick={() => navigate("/")}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Back</button>
            <button onClick={handlePDF}
              className="px-4 py-2 rounded-xl bg-white border border-slate-200 shadow hover:bg-slate-50">Export PDF</button>
          </div>
        </div>

        {/* === t-SNE Plot === */}
        <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-800 font-semibold">t-SNE embedding</h3>
            <div className="text-sm text-slate-600">
              File: {incomingFilename} | Predicted: {incomingPredLabel || "N/A"}
            </div>
          </div>
          <div className="p-4">
            {loadErr && <div className="text-red-600 text-sm mb-2">{loadErr}</div>}
            {!tsneRows ? (
              <div>Loading…</div>
            ) : (
              <Plot
                data={[
                  ...tsneTraces,
                  ...(newSamplePoint ? [{
                    type: "scattergl", mode: "markers",
                    x: [newSamplePoint.x], y: [newSamplePoint.y],
                    marker: { size: 14, color: "black", line: { width: 3, color: "white" } },
                    name: "New Sample",
                  }] : []),
                ]}
                layout={{ margin: { t: 24, r: 16, b: 40, l: 40 }, legend: { orientation: "h", y: -0.15 } }}
                style={{ width: "100%", height: 400 }}
                onInitialized={(f, gd) => (graphRef.current = gd)}
                onUpdate={(f, gd) => (graphRef.current = gd)}
              />
            )}
          </div>
        </section>

        {/* === Attention Heatmaps === */}
        <section className="mb-6 border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-slate-800 font-semibold">Attention heatmaps</h3>
          </div>

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
                <b className="ml-1">{state.most_similar_in_label || "N/A"}</b>
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
        </section>

        {/* === JSON Summary === */}
        <section className="border border-slate-200 rounded-2xl bg-white shadow-sm">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-slate-800 font-semibold">JSON summary</h3>
          </div>
          <div className="p-4 bg-slate-50 rounded-b-2xl">
            <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(summaryJson, null, 2)}</pre>
            <button
              onClick={handleCopy}
              className={`mt-2 px-3 py-1 text-xs rounded transition-colors ${copied ? "bg-slate-200 text-slate-600" : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
            >
              {copied ? "Copied" : "Copy JSON"}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
