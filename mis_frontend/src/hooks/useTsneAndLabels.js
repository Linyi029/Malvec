import { useEffect, useState } from "react";

export default function useTsneAndLabels({ labelListUrl, tsnePointsUrl }) {
  const [labelList, setLabelList] = useState(null);
  const [tsneRows, setTsneRows] = useState(null);
  const [loadErr, setLoadErr] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (!labelListUrl || !tsnePointsUrl) return;
        const [labelsRes, pointsRes] = await Promise.all([fetch(labelListUrl), fetch(tsnePointsUrl)]);
        if (!labelsRes.ok) throw new Error(`labelList HTTP ${labelsRes.status}`);
        if (!pointsRes.ok) throw new Error(`tsnePoints HTTP ${pointsRes.status}`);
        const [labels, points] = await Promise.all([labelsRes.json(), pointsRes.json()]);
        setLabelList(labels);
        setTsneRows(points);
        setLoadErr("");
      } catch (e) {
        setLoadErr(String(e));
      }
    })();
  }, [labelListUrl, tsnePointsUrl]);

  return { labelList, tsneRows, loadErr };
}
