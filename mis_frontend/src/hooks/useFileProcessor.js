import { useState } from "react";

export default function useFileProcessor(props = {}) {
  const { onFileDone } = props; 

  const bulletItems = ["PE 32-file", "is .exe", "is UPX compressed"];
  const [activeQueue, setActiveQueue] = useState([]);
  const [pendingQueue, setPendingQueue] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [circleStep, setCircleStep] = useState(0);
  const [circleDone, setCircleDone] = useState([false, false, false]);
  const [bulletPlayKey, setBulletPlayKey] = useState(0);

  function startNextFile(file) {
    if (!file) return;
    setProcessing(true);
    setCircleStep(0);
    setCircleDone([false, false, false]);
    setBulletPlayKey((k) => k + 1);

    // 模擬 bullet 動畫跑完後才開始圈圈
    const totalMs = bulletItems.length * 3000 + 2000;
    setTimeout(() => setCircleStep(1), totalMs);
  }

  function handleCircleDone(idx) {
    setCircleDone((prev) => {
      const next = [...prev];
      next[idx] = true;
      return next;
    });

    if (idx < 3) {
      setCircleStep(idx + 2);
    } else {
      const file = activeQueue[0];
      onFileDone?.(file); // ✅ 通知外層
      setCircleStep(0);
      setCircleDone([false, false, false]);

      setActiveQueue((prev) => {
        const rest = prev.slice(1);
        if (rest.length > 0) {
          setTimeout(() => startNextFile(rest[0]), 0);
        } else if (pendingQueue.length > 0) {
          const nextBatch = pendingQueue.slice();
          setPendingQueue([]);
          setActiveQueue(nextBatch);
          setTimeout(() => startNextFile(nextBatch[0]), 0);
        } else {
          setProcessing(false);
        }
        return rest;
      });
    }
  }

  function handleFiles(files) {
    const valid = Array.from(files).filter((f) =>
      f.name.toLowerCase().endsWith(".exe")
    );
    if (!processing && activeQueue.length === 0) {
      setActiveQueue(valid);
      startNextFile(valid[0]);
    } else {
      setPendingQueue((prev) => prev.concat(valid));
    }
  }

  return {
    bulletItems,
    bulletPlayKey,
    activeQueue,
    processing,
    circleStep,
    circleDone,
    handleFiles,
    handleCircleDone,
  };
}
