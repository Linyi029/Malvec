import { useRef, useState } from "react";

// ✅ 步驟 1: 延遲 (wait) 輔助函數 (不變)
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

  // ✅ 步驟 2: 重寫 startNextFile (保留 (1).js 的動畫邏輯)
  async function startNextFile(file) {
    if (!file) return;

    // --- 1. 初始化狀態 ---
    currentFileRef.current = file.name;
    setBulletsTitle(file.name);
    setProcessing(true);
    setBulletPlayKey((k) => k + 1);
    setBulletItems([
      "Analyzing PE header...",
      "Reading EXE...",
      "Checking UPX...",
      "Waiting for prediction..."
    ]);

    // ✅ 重設所有圈圈
    setCircleDone([false, false, false, false]);
    
    try {
      // --- 2. 播放第 1 圈 (Disassembling) ---
      setCircleStep(1); 
      await wait(5000); 

      // --- 3. 播放第 2 圈 (Malware Family Identification) 並等待後端 ---
      setCircleStep(2); 

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

      // --- 4. 收到結果，快速播放 3, 4 圈 (保留 (1).js 的動畫) ---
      
      await wait(1500); 
      setCircleStep(3); // (Attention Heatmap)
      await wait(1500); 
      setCircleStep(4); // (SOM Analyzing)
      await wait(1500); 
      setCircleStep(5); // (Done)
      setCircleDone([true, true, true, true]);
      await wait(900); 

      // --- 5. 準備要顯示的資料 (✨ 整合 heatmap) ---
      const det = result.details || {};
      const pred = result.prediction || {};
      const som = result.som_analysis || null;

      // ✨ (新增) 從 useFileProcessor.js 來的 Heatmap 提取
      const attentionHeatmap =
        result.attention_heatmap ||
        pred.attention_heatmap ||
        null;

      // (保留 (1).js 的 SOM 處理)
      let somInfo = null;
      if (som) {
        const pos = som.winner_position || som.position || null;
        const feats =
          som.features_probability ||
          som.features_probabilities ||
          som.features ||
          som.probabilities || {};

        somInfo = {
          winner_position: pos,
          position: pos,
          features_probability: feats,
          features: som.features || {},
          som_visualizations: som.som_visualizations || som.visualizations || null,
        };

        try {
          localStorage.setItem("somAnalysis.latest", JSON.stringify(somInfo));
        } catch (e) {
          console.error("Failed to save SOM analysis to localStorage", e);
        }
      }

      console.log("🔎 Details:", {
        is_pe32: det.is_pe32,
        is_exe: det.is_exe,
        unpack_success: det.unpack_success,
      });
      console.log("🤗 Prediction:", {
        final_label: pred.final_label,
        confidence: pred.confidence,
      });

      const is_pe32 = det.is_pe32 ? "✅ Yes" : "❌ No";
      const is_exe = det.is_exe ? "✅ Yes" : "❌ No";
      const is_upx = det.unpack_success ? "✅ Yes" : "❌ No";

      // --- 6. 按順序更新 UI (✨ 整合 heatmap) ---

      // (A) 更新 AnimatedBullets 的內容
      setBulletItems([
        `PE 32-file: ${is_pe32}`,
        `is .exe: ${is_exe}`,
        `is UPX compressed: ${is_upx}`,
        // ✨ (新增) 加入 Heatmap 狀態
        attentionHeatmap ? "Attention heatmap ready ✅" : "No heatmap ❌",
      ]);
      setBulletsTitle(`${file.name} — 分析完成`);

      // (B) 等待 AnimatedBullets 動畫 (保留 (1).js 的)
      await wait(1500); 

      // (C) 最後才呼叫 onFileDone (✨ 整合 heatmap)
      if (det.is_pe32 && det.is_exe && det.unpack_success) {
        console.log("✅ File passed all checks, sending to Home");
        
        const embedding = pred.embedding?.values || null;
        const tsneProjection = result.tsne_projection || null;
        
        if (embedding && Array.isArray(embedding)) {
          console.log(`✅ Embedding extracted: ${embedding.length} dimensions`);
        } else {
          console.warn("⚠️ No valid embedding found in prediction");
        }
        
        onFileDone?.({
          name: file.name,
          details: det,
          status: result.status,
          prediction: pred,
          embedding: embedding,
          tsneProjection: tsneProjection,
          embeddingInfo: {
            dimension: pred.embedding?.dimension || 0,
            source_file: pred.embedding?.source_file || null,
            attention_score: pred.embedding?.attention_score || 0
          },
          // (保留 (1).js 的)
          somAnalysis: somInfo,
          somAnalysisRaw: som,
          
          // ✨ (新增) 從 useFileProcessor.js 來的 Heatmap 欄位
          attention_heatmap: attentionHeatmap,
          similar_heatmap_image: result.similar_heatmap_image || null,
          most_similar_in_label: result.most_similar_in_label || null,
          similarity_score: result.similarity_score || null,
        });
      } else {
        console.log("⚠️ File failed checks");
      }

    } catch (err) {
      // --- 錯誤處理 (✨ 整合) ---
      console.error("❌ Processing error:", err);
      setBulletItems([
        "分析失敗",
        err.message,
        "請檢查檔案或伺服器",
        "", // ✨ (新增) 確保有 4 個項目
      ]);
      setBulletsTitle(`${file.name} (Error)`);
      setCircleStep(0); 
      setCircleDone([false, false, false, false]);

    } finally {
      // --- 7. 準備處理下一個檔案 (保留 (1).js 的) ---
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

  // (保留 (1).js 的 handleFiles)
  function handleFiles(files) {
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

  // (保留 (1).js 的 exports)
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