import { useRef, useState } from "react";

export default function useFileProcessor(props = {}) {
  const { onFileDone } = props;

  const [bulletItems, setBulletItems] = useState([
    "Analyzing PE header...",
    "Reading EXE...",
    "Checking UPX...",
    "Waiting for prediction..."
  ]);
  const [bulletsTitle, setBulletsTitle] = useState("等待處理的檔案…");
  const [activeQueue, setActiveQueue] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [circleStep, setCircleStep] = useState(0);
  const [circleDone, setCircleDone] = useState([false, false, false, false]);
  const [bulletPlayKey, setBulletPlayKey] = useState(0);

  const API_URL = "http://127.0.0.1:8000/api/analyze";
  const currentFileRef = useRef(null);

  async function startNextFile(file) {
    if (!file) return;

    currentFileRef.current = file.name;
    setBulletsTitle(file.name);
    setProcessing(true);
    setCircleStep(1);
    setCircleDone([false, false, false, false]);
    setBulletPlayKey((k) => k + 1);
    setBulletItems([
      "Analyzing PE header...",
      "Reading EXE...",
      "Checking UPX...",
      "Waiting for prediction..."
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      console.log("📤 Uploading to:", API_URL);

      const response = await fetch(API_URL, {
        method: "POST",
        body: formData,
      });

      setCircleStep(2);
      console.log("📥 Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      setCircleStep(3);
      console.log("📊 Analysis result:", result);

      const det = result.details || {};
      const pred = result.prediction || {};

      console.log("🔎 Details:", {
        is_pe32: det.is_pe32,
        is_exe: det.is_exe,
        unpack_success: det.unpack_success,
      });

      console.log("🤗 Prediction:", {
        final_label: pred.final_label,
        confidence: pred.confidence,
        embedding_dimension: pred.embedding?.dimension,
        attention_heatmap_shape: Array.isArray(pred.attention_heatmap)
          ? [pred.attention_heatmap.length, pred.attention_heatmap[0]?.length]
          : "N/A",
      });

      // ✅ 取得 heatmap (不管後端放哪一層)
      const attentionHeatmap =
        result.attention_heatmap ||
        pred.attention_heatmap ||
        null;

      setBulletItems([
        `PE 32-file: ${det.is_pe32 ? "✅" : "❌"}`,
        `is .exe: ${det.is_exe ? "✅" : "❌"}`,
        `is UPX compressed: ${det.unpack_success ? "✅" : "❌"}`,
        attentionHeatmap ? "Attention heatmap ready ✅" : "No heatmap ❌",
      ]);

      setBulletsTitle(`${file.name} — 分析完成`);
      setCircleStep(4);
      setCircleDone([true, true, true, true]);

      // ✅ 如果通過條件，傳給上層
      if (det.is_pe32 && det.is_exe && det.unpack_success) {
        const embedding = pred.embedding?.values || null;
        const tsneProjection = result.tsne_projection || null;

        onFileDone?.({
          name: file.name,
          details: det,
          status: result.status,
          prediction: pred,
          embedding,
          tsneProjection,
          attention_heatmap: result.attention_heatmap || pred.attention_heatmap || null, // ✅ heatmap
          similar_heatmap_image: result.similar_heatmap_image || null,
          most_similar_in_label: result.most_similar_in_label || null,
          similarity_score: result.similarity_score || null,
          // similar_heatmap_image: result.similar_heatmap_image || null, // ✅ 相似 heatmap
          // most_similar_in_label: result.most_similar_in_label || null, // ✅ 檔名
          // similarity_score: result.similarity_score || null, // ✅ 分數
          embeddingInfo: {
            dimension: pred.embedding?.dimension || 0,
            source_file: pred.embedding?.source_file || null,
            attention_score: pred.embedding?.attention_score || 0,
          },
        });
      }
    } catch (err) {
      console.error("❌ Processing error:", err);
      setBulletItems([
        "分析失敗",
        err.message,
        "請檢查檔案或伺服器",
        "",
      ]);
      setBulletsTitle(`${file.name} (Error)`);
      onFileDone?.({ name: file.name, status: "failed", error: err.message });
    } finally {
      // 延遲一點讓 UI 穩定顯示
      setTimeout(() => {
        setProcessing(false);
        setActiveQueue((prev) => {
          const rest = prev.slice(1);
          if (rest.length > 0) {
            startNextFile(rest[0]);
          } else if (pendingQueue.length > 0) {
            const nextBatch = pendingQueue.slice();
            setPendingQueue([]);
            setActiveQueue(nextBatch);
            startNextFile(nextBatch[0]);
          } else {
            setBulletsTitle(`${currentFileRef.current} — 已完成 ✅`);
          }
          return rest;
        });
      }, 2000);
    }
  }

  function handleFiles(files) {
    // ✅ 接受 .exe 檔案或 Unix 無副檔名可執行檔
    const valid = Array.from(files).filter((f) => {
      const name = f.name.toLowerCase();
      return name.endsWith(".exe") || !name.includes(".");
    });

    if (valid.length === 0) {
      console.warn("⚠️ No executable files found (.exe or Unix executables)");
      return;
    }

    console.log(`📂 Adding ${valid.length} files to queue`);

    if (!processing && activeQueue.length === 0) {
      setActiveQueue(valid);
      startNextFile(valid[0]);
    } else {
      setPendingQueue((prev) => prev.concat(valid));
    }
  }
  function handleCircleDone(index) {
    setCircleDone(prev => {
      const newDone = [...prev];
      newDone[index] = true;
      return newDone;
    });
  }

  return {
    bulletItems,
    bulletsTitle,
    bulletPlayKey,
    activeQueue,
    processing,
    circleStep,
    circleDone,
    handleFiles,
    handleCircleDone, // ✅ 現在真的存在
  };
}
