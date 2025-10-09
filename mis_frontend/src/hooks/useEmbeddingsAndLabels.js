import { useEffect, useState } from "react";

// 與原本頁面一致的處理：讀 labelList、讀 embedding points、補 time_period、去重、回傳時間範圍控制
export default function useEmbeddingsAndLabels({ LABEL_LIST_URL, EMBEDDING_URL }) {
  const [labelList, setLabelList] = useState(null);
  const [allPoints, setAllPoints] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  const [timeMin, setTimeMin] = useState(1);
  const [timeMax, setTimeMax] = useState(1);
  const [selMin, setSelMin] = useState(1);
  const [selMax, setSelMax] = useState(1);

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

        // time_period 建立
        const hasTime = pts.length && typeof pts[0].first_submission_date !== "undefined";
        let enriched = hasTime
          ? pts.map(r => ({ ...r, time_period: Number(r.first_submission_date) }))
          : pts.map((r, i) => ({ ...r, time_period: i + 1 }));

        // 去重
        const keyOf = (r) => `${r.x}|${r.y}|${r.pred_label ?? ""}|${r.time_period ?? ""}`;
        enriched = Array.from(new Map(enriched.map(r => [keyOf(r), r])).values());

        setAllPoints(() => enriched);

        const tMin = Math.max(1, Math.min(...enriched.map((r) => Number(r.time_period) || 1)));
        const tMax = Math.max(...enriched.map((r) => Number(r.time_period) || 1));
        setTimeMin(tMin);
        setTimeMax(tMax);
        setSelMin(tMin);
        setSelMax(tMax);
        setLoadErr("");
      } catch (e) {
        setLoadErr(String(e));
      }
    })();
  }, [LABEL_LIST_URL, EMBEDDING_URL]);

  return {
    labelList, allPoints, loadErr,
    timeMin, timeMax, selMin, selMax,
    setSelMin, setSelMax,
  };
}
