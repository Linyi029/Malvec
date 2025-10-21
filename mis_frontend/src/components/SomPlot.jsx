import React, { useEffect, useMemo } from "react";
import Plot from "react-plotly.js";

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
    marker: { size: 10 },
    marker_color: labelColors[lab] || "#7f7f7f",
    name: lab,
    showlegend: true,
    hoverinfo: "skip",
  }));
}
function buildSomPlotPieMulti(somArray, labelColorsFromAll, opts = {}, extraPoints = []) {
  const { radius = 0.35, k = 3, showOther = true, outlineColor = "#333", outlineWidth = 0.6 } = opts;
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
    const props = Object.entries(c.proportions || {}).map(([lab, v]) => [lab, Number(v) || 0]).sort((a,b)=>b[1]-a[1]);
    const top = props.slice(0, k);
    const rest = props.slice(k);
    if (showOther && rest.length) {
      const otherVal = rest.reduce((a, [, v]) => a + v, 0);
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
  const labelsInThisSom = collectLabelsFromSom(somArray, 30);
  const legendTraces = makeLegendTraces(labelsInThisSom, labelColorsFromAll, maxCol + 5, maxRow + 5);
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
    type: "scatter", mode: "markers",
    x: extraPoints.map(p => p.x), y: extraPoints.map(p => p.y),
    marker: { size: 10 },
    marker_color: "black",
    name: "test point",
    showlegend: false,
    hoverinfo: "skip",
  } : null;
  return {
    traces: testPointTrace ? [baseTrace, ...legendTraces, testPointTrace] : [baseTrace, ...legendTraces],
    layout
  };
}

export default function SomPlot({ somDatasets, somIndex, setSomIndex, labelColors, testPoints }) {
  const pages = somDatasets.length;

  const content = useMemo(() => {
    if (!pages) return null;
    return somDatasets.map((somArray, i) => {
      const extraPt = testPoints?.[i] ? [testPoints[i]] : [];
      return buildSomPlotPieMulti(somArray, labelColors, { radius: 0.35, k: 3, showOther: true }, extraPt);
    });
  }, [somDatasets, labelColors, testPoints, pages]);

  // ★ 關鍵：索引切換後觸發一次 resize，讓 Plotly 依新尺寸重排
  useEffect(() => {
    const id = setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 0);
    return () => clearTimeout(id);
  }, [somIndex]);

  if (!pages) return null;

  return (
    <div className="relative">
      {/* 導覽 */}
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setSomIndex((somIndex - 1 + pages) % pages)}
          className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
        >←</button>
        <div className="text-sm text-slate-600">{somIndex + 1} / {pages}</div>
        <button
          onClick={() => setSomIndex((somIndex + 1) % pages)}
          className="px-3 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50"
        >→</button>
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

      <div className="relative">
        {content.map(({ traces, layout }, i) => {
          const isActive = i === somIndex;
          return (
            <div
              key={i}
              style={
                isActive
                  ? { width: "100%", height: 500 }
                  : { position: "absolute", left: -9999, top: 0, width: 1, height: 1, opacity: 0 }
              }
            >
              {/* 讓 Plot 填滿父容器，避免 1x1 殘留 */}
              <div style={{ width: "100%", height: "100%", maxWidth: 800, aspectRatio: "1 / 1" }}>
                <Plot
                  data={traces}
                  layout={{ ...layout, autosize: true }}   // ← 必加
                  style={{ width: "100%", height: "100%" }} // ← 必加
                  useResizeHandler                         // ← 必加
                  config={{ responsive: true, displayModeBar: true }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
