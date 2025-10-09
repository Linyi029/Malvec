import { useEffect, useState } from "react";

// 規格化函式（沿用原始頁面邏輯）
function normalizeSomJson(root) {
  const tryArray = (arr) => Array.isArray(arr) ? arr : null;
  const objectValuesIfIndexObject = (obj) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;
    const keys = Object.keys(obj);
    if (!keys.length) return null;
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

export default function useSomDatasets({ somUrls }) {
  const [somDatasets, setSomDatasets] = useState([]);
  const [somTitles, setSomTitles] = useState([]);
  const [somErr, setSomErr] = useState("");

  useEffect(() => {
    (async () => {
      if (!somUrls || !somUrls.length) return;
      try {
        const resps = await Promise.all(somUrls.map(u => fetch(u, { cache: "no-store" })));
        resps.forEach((r, i) => { if (!r.ok) throw new Error(`SOM[${i}] HTTP ${r.status}`); });

        const texts = await Promise.all(resps.map(r => r.text()));
        const jsons = texts.map((t, i) => {
          try { return JSON.parse(t); }
          catch (e) { console.error(`[SOM] JSON parse failed @${i}`, e, t?.slice(0, 200)); throw new Error(`SOM[${i}] JSON parse failed`); }
        });

        const norm = jsons.map((j, i) => {
          const arr = normalizeSomJson(j);
          console.log(`[SOM] dataset #${i} normalized length:`, arr.length);
          if (arr.length) console.log(`[SOM] sample[${i}]:`, arr.slice(0, 2));
          return arr;
        });

        // 你原本給的是固定兩張，這裡也沿用：
        const titles = ['SOM-APT30', 'SOM-dropper'];

        setSomDatasets(norm);
        setSomTitles(titles);
        setSomErr("");
      } catch (e) {
        console.error(e);
        setSomErr(String(e?.message || e));
        setSomDatasets([]);
        setSomTitles([]);
      }
    })();
  }, [somUrls]);

  return { somDatasets, somTitles, somErr };
}
