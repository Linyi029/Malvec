import { useRef, useState } from "react";

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
  const currentFileRef = useRef(null);

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

    // 除錯: 檢查原始檔案
    console.log(" Processing file:", {
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: new Date(file.lastModified).toISOString()
    });

    //  驗證檔案是否為有效的 PE 檔案
    try {
      const headerCheck = await file.slice(0, 2).arrayBuffer();
      const magic = new Uint8Array(headerCheck);
      const magicHex = Array.from(magic).map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log("File magic bytes:", magicHex);
      
      if (magicHex !== '4d5a') {
        console.warn("⚠️  File doesn't start with MZ header!");
        setBulletItems([
          "❌ Not a valid PE file",
          `Magic bytes: ${magicHex}`,
          "Expected: 4d5a (MZ)"
        ]);
        setBulletsTitle(`${file.name} — Invalid PE`);
        setProcessing(false);
        
        // 處理下一個檔案
        setTimeout(() => {
          setActiveQueue((prev) => {
            const rest = prev.slice(1);
            if (rest.length > 0) {
              startNextFile(rest[0]);
            } else if (pendingQueue.length > 0) {
              const nextBatch = pendingQueue.slice();
              setPendingQueue([]);
              setActiveQueue(nextBatch);
              startNextFile(nextBatch[0]);
            }
            return rest;
          });
        }, 1500);
        
        return;
      }
    } catch (err) {
      console.error("Failed to read file header:", err);
    }

    try {
      const formData = new FormData();
      
      //  關鍵修正: 明確指定檔名和類型
      formData.append("file", file, file.name);
      
      console.log(" Uploading to:", API_URL);

      const response = await fetch(API_URL, { 
        method: "POST", 
        body: formData,
        //  不要設定 Content-Type header,讓瀏覽器自動處理
      });

      console.log(" Response status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Server error:", errorText);
        throw new Error(`Server error: ${response.status}`);
      }

      const result = await response.json();
      console.log("📊 Analysis result:", result);

      const det = result.details || {};
      
      //  除錯: 顯示詳細結果
      console.log("Details:", {
        is_pe32: det.is_pe32,
        is_exe: det.is_exe,
        unpack_success: det.unpack_success,
        raw: det
      });

      const is_pe32 = det.is_pe32 ? "✅ Yes" : "❌ No";
      const is_exe = det.is_exe ? "✅ Yes" : "❌ No";
      const is_upx = det.unpack_success ? "✅ Yes" : "❌ No";

      setBulletItems([
        `PE 32-file: ${is_pe32}`,
        `is .exe: ${is_exe}`,
        `is UPX compressed: ${is_upx}`
      ]);

      setBulletsTitle(`${file.name} — 分析完成`);

      //  通過條件才送進待訓練資料
      if (det.is_pe32 && det.is_exe && det.unpack_success) {
        console.log(" File passed all checks, sending to Home");
        onFileDone?.({
          name: file.name,
          details: det,
          status: result.status
        });
      } else {
        console.log("File failed checks:", {
          is_pe32: det.is_pe32,
          is_exe: det.is_exe,
          unpack_success: det.unpack_success
        });
      }
    } catch (err) {
      console.error("Processing error:", err);
      setBulletItems([
        "分析失敗",
        err.message,
        "請檢查檔案或伺服器"
      ]);
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
            setBulletsTitle(`${currentFileRef.current} — 已完成 `);
          }
          return rest;
        });
      }, 1200);
    }
  }

  function handleFiles(files) {
    const valid = Array.from(files).filter(f => 
      f.name.toLowerCase().endsWith('.exe')
    );
    
    if (valid.length === 0) {
      console.warn("No .exe files found");
      return;
    }

    console.log(`Adding ${valid.length} files to queue`);

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