import { useState, useRef } from "react";

export default function useFileProcessor(props = {}) {
  const { onFileDone } = props;

  const [bulletItems, setBulletItems] = useState([
    "Analyzing PE header...",
    "Reading EXE...",
    "Checking UPX..."
  ]);
  const [bulletsTitle, setBulletsTitle] = useState("等待處理的檔案…");
  const [activeQueue, setActiveQueue] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [circleStep, setCircleStep] = useState(0);
  const [circleDone, setCircleDone] = useState([false, false, false]);
  const [bulletPlayKey, setBulletPlayKey] = useState(0);

  const API_URL = "http://127.0.0.1:8000/api/analyze";
  const currentFileRef = useRef(null); // 🔹 確保標題綁定不會被 re-render 清空

  async function startNextFile(file) {
    if (!file) return;

    currentFileRef.current = file.name;
    setBulletsTitle(file.name);
    setProcessing(true);
    setCircleStep(0);
    setCircleDone([false, false, false]);
    setBulletPlayKey((k) => k + 1);
    setBulletItems([
      "Analyzing PE header...",
      "Reading EXE...",
      "Checking UPX..."
    ]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(API_URL, { method: "POST", body: formData });
      if (!response.ok) throw new Error("Server error!");

      const result = await response.json();
      const det = result.details || {};
      const is_pe32 = det.is_pe32 ? "✅ Yes" : "❌ No";
      const is_exe = det.is_exe ? "✅ Yes" : "❌ No";
      const is_upx = det.unpack_success ? "✅ Yes" : "❌ No";

      setBulletItems([
        `PE 32-file: ${is_pe32}`,
        `is .exe: ${is_exe}`,
        `is UPX compressed: ${is_upx}`
      ]);

      // 🔸 保持目前檔名，不會被空狀態覆蓋
      setBulletsTitle(`${file.name} — 分析完成`);

      // ✅ 通過條件才送進待訓練資料
      if (det.is_pe32 && det.is_exe && det.unpack_success) {
        //console.log("✅ Sending to Home:", det);
        onFileDone?.({
          name: file.name,
          details: det,
          status: result.status
        });
      }
    } catch (err) {
      setBulletItems(["分析失敗，請重試"]);
      setBulletsTitle(`${file.name} (Error)`);
    } finally {
      // 延遲結束 processing，讓 UI 穩定顯示結果
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
            // 🟢 維持最後一個檔案名稱，不閃回
            setBulletsTitle(`${currentFileRef.current} — 已完成 ✅`);
          }
          return rest;
        });
      }, 1200);
    }
  }

  function handleFiles(files) {
    const valid = Array.from(files);
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
