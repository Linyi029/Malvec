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
    setCircleStep(0);
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

      console.log("📥 Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log("📊 Analysis result:", result);

      const det = result.details || {};
      const pred = result.prediction || {};
      
      // 🔍 除錯: 顯示詳細結果
      console.log("🔎 Details:", {
        is_pe32: det.is_pe32,
        is_exe: det.is_exe,
        unpack_success: det.unpack_success,
      });
      
      console.log("🤗 Prediction:", {
        final_label: pred.final_label,
        confidence: pred.confidence,
        embedding_dimension: pred.embedding?.dimension,
        embedding_values_length: pred.embedding?.values?.length,
        embedding_source: pred.embedding?.source_file,
        attention_score: pred.embedding?.attention_score
      });

      const is_pe32 = det.is_pe32 ? "✅ Yes" : "❌ No";
      const is_exe = det.is_exe ? "✅ Yes" : "❌ No";
      const is_upx = det.unpack_success ? "✅ Yes" : "❌ No";

      // 📸 更新子彈點 (註解掉預測結果顯示)
      // const predictionText = pred.final_label 
      //   ? `Predicted: ${pred.final_label} (${(pred.confidence * 100).toFixed(1)}%)`
      //   : "Prediction unavailable";

      setBulletItems([
        `PE 32-file: ${is_pe32}`,
        `is .exe: ${is_exe}`,
        `is UPX compressed: ${is_upx}`,
        ""  // ✅ 改成空字串，不顯示預測結果
      ]);

      setBulletsTitle(`${file.name} — 分析完成`);

      // ✅ 通過條件才送進待訓練資料,並傳遞完整的 prediction (包含 embedding)
      if (det.is_pe32 && det.is_exe && det.unpack_success) {
        console.log("✅ File passed all checks, sending to Home");
        
        // ✅ 提取完整 768 維 embedding
        const embedding = pred.embedding?.values || null;
        
        // ✅ 新增：提取 t-SNE 投影座標
        const tsneProjection = result.tsne_projection || null;
        
        if (embedding && Array.isArray(embedding)) {
          console.log(`✅ Embedding extracted: ${embedding.length} dimensions`);
          console.log(`   First 5 values: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
        } else {
          console.warn("⚠️ No valid embedding found in prediction");
        }
        
        if (tsneProjection) {
          console.log(`✅ t-SNE projection: (${tsneProjection.x.toFixed(3)}, ${tsneProjection.y.toFixed(3)})`);
          console.log(`   Confidence: ${tsneProjection.confidence.toFixed(3)}`);
        } else {
          console.warn("⚠️ No t-SNE projection found");
        }
        
        onFileDone?.({
          name: file.name,
          details: det,
          status: result.status,
          prediction: pred,  // ✅ 傳遞完整的 prediction 物件
          embedding: embedding,  // ✅ 直接傳遞 768 維 embedding array
          tsneProjection: tsneProjection,  // ✅ 新增：t-SNE 投影座標
          embeddingInfo: {
            dimension: pred.embedding?.dimension || 0,
            source_file: pred.embedding?.source_file || null,
            attention_score: pred.embedding?.attention_score || 0
          }
        });
      } else {
        console.log("⚠️ File failed checks");
      }
    } catch (err) {
      console.error("❌ Processing error:", err);
      setBulletItems([
        "分析失敗",
        err.message,
        "請檢查檔案或伺服器",
        ""
      ]);
      setBulletsTitle(`${file.name} (Error)`);
    } finally {
      // 延遲結束 processing,讓 UI 穩定顯示結果
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
      }, 1200);
    }
  }

  function handleFiles(files) {
    // ✅ 接受 .exe 檔案或沒有副檔名的檔案 (Unix executables)
    const valid = Array.from(files).filter(f => {
      const name = f.name.toLowerCase();
      const hasExeExtension = name.endsWith('.exe');
      const hasNoExtension = !name.includes('.');
      
      return hasExeExtension || hasNoExtension;
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

  return {
    bulletItems,
    bulletsTitle,
    bulletPlayKey,
    activeQueue,
    processing,
    circleStep,
    circleDone,
    handleFiles,
  };
}