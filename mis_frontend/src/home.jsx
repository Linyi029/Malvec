import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedBullets from "./components/AnimatedBullets";
import BulkLabelModal from "./components/BulkLabelModal"; // (from home(1))
import CircleProgress from "./components/CircleProgress";
import LabelModal from "./components/LabelModal.jsx"; // ✨ (from home.jsx)
import TopBar from "./components/TopBar";
import TrainingModal from "./components/TrainingModal"; // (from home(1))
import useFileProcessor from "./hooks/useFileProcessor";

const TRAIN_ROWS_KEY = 'malvec.trainRowsData'; // (from home(1))

/** ==========================
 * 設定標籤來源與顏色
 * ========================== */
export const LABELS_JSON = "https://raw.githubusercontent.com/syy88824/C_practice/refs/heads/main/label_list.json";
export const BASE_PALETTE = [
    "#1f77b4", "#f4b37aff", "#63c063ff", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#393b79", "#637939", "#8c6d31", "#843c39", "#7b4173",
    "#3182bd", "#406d4dff", "#756bb1", "#636363", "#b9450bff",
    "#9c9ede", "#e7ba52", "#b5cf6b", "#cedb9c",
];
const assignColors = (labels) => {
    const map = {};
    labels.forEach((lab, i) => { map[lab] = BASE_PALETTE[i % BASE_PALETTE.length]; });
    return map;
};

export default function Home() {
    const navigate = useNavigate();
    useEffect(() => { document.title = "File Uploading"; }, []);

    /** ===== 讀取 labels ===== */
    const [labelChoices, setLabelChoices] = useState([]);
    const colors = useMemo(() => assignColors(labelChoices), [labelChoices]);
    useEffect(() => {
        (async () => {
            try {
                const r = await fetch(LABELS_JSON);
                const js = await r.json();
                const arr = Array.isArray(js) ? js : (Array.isArray(js.labels) ? js.labels : []);
                if (arr?.length) setLabelChoices([...new Set(arr.map(String))]);
            } catch { }
        })();
    }, []);

    // ===== ✨ (from home.jsx) Space B & A 設定 =====
    const SPACE_B_URL = "https://lyi029-model-update-test.hf.space";
    const SPACE_A_URL = "https://lyi029-test.hf.space";
    
    // ===== ✨ (from home.jsx) Label Modal State =====
    const [labelModal, setLabelModal] = useState({
        open: false,
        samples: [],
        labelFile: null,
    });
    
    // ===== ✨ (from home.jsx) 模型更新狀態 =====
    const [modelUpdateStatus, setModelUpdateStatus] = useState("");


    /** ===== 上傳與動畫流程 Hook ===== */
    const nextId = useRef(1);

    /**
     * ✅ 提取 predicted label (from home(1))
     */
    const getPredictedLabel = (res) => {
        const cands = [
          res?.prediction?.final_label,
          res?.prediction?.finalLabel,
          res?.final_label,
          res?.finalLabel,
          res?.pred_label,
          res?.predLabel,
        ];
        const val = cands.find(v => typeof v === "string" && v.trim());
        return (val || "unknown").toUpperCase();
    };

    /**
     * ✅ 處理檔案完成的 callback (✨ 整合)
     */
    const handleFileDone = useCallback((fileResult) => {
        if (!fileResult || !fileResult.details) return;

        const det = fileResult.details;
        const passed = det.is_pe32 && det.is_exe && det.unpack_success;

        if (!passed) {
            console.log("❌ File did not pass all checks:", det);
            return;
        }

        const predictedLabel = getPredictedLabel(fileResult);

        // ✅ (from home(1)) 提取 embedding
        const embedding = fileResult.embedding || 
                         fileResult.prediction?.embedding?.values || 
                         null;
        
        const embeddingInfo = fileResult.embeddingInfo || {
            dimension: embedding?.length || 0,
            source_file: fileResult.prediction?.embedding?.source_file || null,
            attention_score: fileResult.prediction?.embedding?.attention_score || 0
        };

        // ✅ (from home(1)) 驗證 embedding
        if (embedding && Array.isArray(embedding)) {
            console.log("✅ Added to training set:", fileResult.name);
            console.log("🤗 Prediction (label):", predictedLabel);
            console.log("📊 Embedding info:", {
                dimension: embedding.length,
                source_file: embeddingInfo.source_file,
                attention_score: embeddingInfo.attention_score,
                first_5_values: embedding.slice(0, 5).map(v => v.toFixed(4))
            });
        } else {
            console.warn("⚠️ No valid embedding found for:", fileResult.name);
        }
        
        // ✨ (from home.jsx) 提取 Heatmap 資料
        const attentionHeatmap = fileResult.attention_heatmap || null;
        const similarHeatmapImage = fileResult.similar_heatmap_image || null;
        const mostSimilarInLabel = fileResult.most_similar_in_label || null;
        const similarityScore = fileResult.similarity_score || null;

        const id = nextId.current++;

        setTrainRows((prev) => [
            {
                id,
                filename: fileResult.name,
                pred: predictedLabel,
                trueLabel: "-", // (from home(1))
                provision: "", // (from home(1))
                details: fileResult.details,
                embedding: embedding,
                embeddingDimension: embedding?.length || 0,
                embeddingSource: embeddingInfo.source_file,
                attentionScore: embeddingInfo.attention_score,
                confidence: fileResult.prediction?.confidence || 0,
                somAnalysis: fileResult.somAnalysis, // (from home(1))
                
                // ✨ (from home.jsx) 新增 Heatmap 相關欄位
                attention_heatmap: attentionHeatmap,
                similar_heatmap_image: similarHeatmapImage,
                most_similar_in_label: mostSimilarInLabel,
                similarity_score: similarityScore,
            },
            ...prev,
        ]);

        // ✨ (from home.jsx) 觸發主動學習檢查
        fetch(`${SPACE_A_URL}/check-new-samples`, { method: "POST" })
            .then(res => res.json())
            .then(js => {
                console.log("🚀 Triggered model check:", js);

                if (js.status === "need_labeling") {
                    setModelUpdateStatus(
                        `⚠️ 模型偵測高不確定性（entropy=${js.mean_entropy.toFixed(3)}），需要人工標註 ${js.samples_to_label.length} 筆樣本`
                    );
                    setLabelModal({
                        open: true,
                        samples: js.samples_to_label,
                        labelFile: js.label_file,
                    });
                    return;
                }
                if (js.status === "use_existing_model") {
                    setModelUpdateStatus(
                        `✅ 使用既有模型分支：${js.recommended_branch}（entropy=${js.mean_entropy.toFixed(3)}）`
                    );
                } else if (js.status === "ok") {
                    setModelUpdateStatus("✅ 模型已更新完成");
                } else {
                    setModelUpdateStatus("ℹ️ 模型檢查完成（未觸發更新）");
                }
            })
            .catch(err => {
                console.error("⚠️ Failed to trigger Space B check:", err);
                setModelUpdateStatus("⚠️ 無法聯絡 Space B");
            });
            
    },[]); // (home(1) 的 useCallback 是空的, 這裡保持)


    // 呼叫 useFileProcessor
    const {
        bulletItems,
        bulletsTitle,
        bulletPlayKey,
        activeQueue,
        processing,
        circleStep,
        circleDone,
        handleFiles,
        handleCircleDone, // (來自 home(1) & home)
    } = useFileProcessor({ onFileDone: handleFileDone });

     /** ===== (from home(1)) 模型待訓練資料 (使用 sessionStorage) ===== */
    const [trainRows, setTrainRows] = useState(() => {
        try {
            const storedData = sessionStorage.getItem(TRAIN_ROWS_KEY);
            if (storedData) {
                const parsedData = JSON.parse(storedData);
                if (Array.isArray(parsedData) && parsedData.length > 0) {
                    if (nextId && nextId.current) {
                         nextId.current = Math.max(...parsedData.map(r => r.id)) + 1;
                    }
                    return parsedData;
                }
            }
        } catch (e) {
            console.error("Failed to read trainRows from sessionStorage", e);
        }
        return [];
    });

    // ✅ (from home(1)) 存入 sessionStorage
    useEffect(() => {
        try {
            sessionStorage.setItem(TRAIN_ROWS_KEY, JSON.stringify(trainRows));
        } catch (e) {
            console.error("Failed to save trainRows to sessionStorage", e);
        }
    }, [trainRows]);


    /** ===== (from home(1)) Bulk JSON 匯入 ===== */
    const [bulkOpen, setBulkOpen] = useState(false);
    const [bulkText, setBulkText] = useState("");
    const [bulkFile, setBulkFile] = useState(null);
    const [bulkError, setBulkError] = useState("");
    const applyBulkJson = (entries) => {
        setTrainRows(prev => prev.map(row => {
            const hit = entries.find(e => e.filename === row.filename);
            if (!hit) return row;
            const v = hit.true_label;
            return { ...row, trueLabel: v, provision: v };
        }));
    };
    const parseBulk = async () => {
        try {
            setBulkError("");
            let text = bulkText.trim();
            if (bulkFile) text = await bulkFile.text();
            if (!text) return;
            let data = JSON.parse(text);
            if (!Array.isArray(data)) data = [data];
            const entries = [];
            for (const it of data) {
                if (it && typeof it === "object" && "filename" in it && "true_label" in it)
                    entries.push({ filename: String(it.filename), true_label: String(it.true_label) });
            }
            if (!entries.length) throw new Error("Empty or invalid JSON format.");
            applyBulkJson(entries);
            setBulkOpen(false); setBulkText(""); setBulkFile(null);
        } catch {
            setBulkError("JSON 解析失敗，請確認格式為：[{\"filename\":\"xxx.exe\",\"true_label\":\"trojan\"}, ...]");
        }
    };

    /** ===== (from home(1)) Training Modal ===== */
    const [trainOpen, setTrainOpen] = useState(false);
    const eligible = useMemo(() => trainRows.filter(r => r.trueLabel && r.trueLabel !== "-"), [trainRows]);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [selectAll, setSelectAll] = useState(false);
    const [training, setTraining] = useState(false);
    const [trainCircleKey, setTrainCircleKey] = useState(0);

    const toggleSelectAll = () => {
        if (selectAll) { setSelectedIds(new Set()); setSelectAll(false); }
        else { setSelectedIds(new Set(eligible.map(r => r.id))); setSelectAll(true); }
    };
    const toggleOne = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };
    const startTraining = () => {
        if (!selectedIds.size) { setTrainOpen(false); return; }
        setTraining(true);
        setTrainCircleKey(k => k + 1);
        
        const selectedData = trainRows.filter(row => selectedIds.has(row.id));
        console.log("🚀 Starting training with data:", {
            total: selectedData.length,
            with_embedding: selectedData.filter(r => r.embedding).length,
            sample_embedding_dim: selectedData[0]?.embeddingDimension
        });
        
        setTimeout(() => {
            setTraining(false);
            setTrainOpen(false);
            setTrainRows([]);
            setSelectedIds(new Set());
            setSelectAll(false);
        }, 10000);
    };

    /** ===== 狀態顯示 ===== */
    const remaining = activeQueue.length > 0 ? activeQueue.length : 0;
    const total = activeQueue.length > 0 ? activeQueue.length : 0;

    /** ===== 上傳事件 ===== */
    const onInputChange = (e) => handleFiles(e.target.files);
    const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            <TopBar />

            <main className="mx-auto max-w-6xl px-4 py-8 grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* 上傳區 */}
                <section
                    className="xl:col-span-2 border-2 border-dashed border-slate-300 rounded-xl p-8 bg-white shadow-sm"
                    onDrop={onDrop}
                    onDragOver={(e) => e.preventDefault()}
                >
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-semibold text-slate-800">Upload executables (.exe or Unix)</h2>
                        <div className="text-xs text-slate-500">支援多檔與整個資料夾上傳（.exe 或 Unix 執行檔）</div>
                    </div>

                    <div className="flex items-center gap-3">
                        <input type="file" multiple webkitdirectory="true" directory="true" className="hidden" id="folderInput" onChange={onInputChange} />
                        <label htmlFor="folderInput" className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer">
                            Select folder
                        </label>

                        <input type="file" multiple id="filesInput" className="hidden" onChange={onInputChange} />
                        <label htmlFor="filesInput" className="px-4 py-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 cursor-pointer">
                            Select executables
                        </label>

                        <span className="text-sm text-slate-500">或直接把資料夾/檔案拖曳到此區</span>
                    </div>

                    <div className="mt-4 text-sm text-slate-600">
                        {total ? `待處理檔案數：${remaining} / ${total}` : "尚未選擇檔案"}
                    </div>
                </section>

                {/* Bullet 動畫 */}
                <div className="xl:col-span-1 min-w-0">
                    <AnimatedBullets
                        items={bulletItems}
                        playKey={bulletPlayKey}
                        title={bulletsTitle}
                    />
                </div>

                {/* Progress 圈圈 */}
                <section className="xl:col-span-3 bg-white border rounded-xl p-6 shadow-sm">
                    <h3 className="font-semibold text-slate-800 mb-4">Processing (per file)</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {["Disassembling", "Malware Family Identification", "Attention Heatmap Visualization", "SOM Analyzing"].map((label, i) => {
                            const status =
                                circleStep === 0 ? (circleDone[i] ? "done" : "idle")
                                    : (i + 1 < circleStep ? "done" : (i + 1 === circleStep ? "active" : "idle"));
                            return (
                                <div key={label} className="flex flex-col items-center gap-2">
                                    {/* ✨ (from home.jsx) 加上 onDone */}
                                    <CircleProgress 
                                        durationSec={0.5} 
                                        status={status} 
                                        onDone={() => handleCircleDone(i)} 
                                    />
                                    <div className="text-slate-700 text-sm">{label}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 text-xs text-slate-500">{processing ? bulletsTitle : ""} </div>
                </section>

                {/* (from home(1)) 模型待訓練表格 */}
                <section className="xl:col-span-3 bg-white border rounded-xl p-6 shadow-sm">
                    {/* ✨ (from home.jsx) 加入狀態顯示 */}
                    {modelUpdateStatus && (
                        <div className="text-sm text-slate-500 mb-3">{modelUpdateStatus}</div>
                    )}

                    <div className="flex items-start justify-between mb-3">
                        <h3 className="text-lg font-semibold text-slate-800">已分析完成</h3>
                        {/* (from home(1)) 保留 Bulk Label 按鈕 */}
                        <button
                            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-sm"
                            onClick={() => setBulkOpen(true)}
                        >
                            匯入 true label（JSON / 貼上代碼）
                        </button>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-600 border-b">
                                    <th className="py-2 pr-4">Filename</th>
                                    <th className="py-2 pr-4">Predicted label</th>
                                    <th className="py-2 pr-4">True label</th> {/* (from home(1)) */}
                                    <th className="py-2 pr-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trainRows.map(row => (
                                    <tr key={row.id} className="border-b last:border-b-0">
                                        <td className="py-2 pr-4 font-mono">{row.filename}</td>
                                        <td className="py-2 pr-4">{row.pred}</td>
                                        <td className="py-2 pr-4">{row.trueLabel}</td> {/* (from home(1)) */}
                                        <td className="py-2 pr-4">
                                            <button
                                                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                                                // ✨ (整合) 導航時傳遞 SOM 和 Heatmap 資料
                                                onClick={() => {
                                                    // (from home.jsx) Heatmap 編碼
                                                    let heatmapData = row.attention_heatmap || null;
                                                    if (heatmapData && typeof heatmapData === "object") {
                                                        heatmapData = heatmapData.image || JSON.stringify(heatmapData);
                                                    }
                                                    const encodedHeatmap = heatmapData ? encodeURIComponent(heatmapData) : null;

                                                    navigate("/report", { 
                                                        state: { 
                                                            // (from home(1))
                                                            filename: row.filename, 
                                                            predLabel: row.pred,
                                                            embedding: row.embedding,
                                                            embeddingSource: row.embeddingSource,
                                                            confidence: row.confidence,
                                                            somAnalysis: row.somAnalysis,
                                                            
                                                            // ✨ (from home.jsx)
                                                            attention_heatmap: encodedHeatmap,
                                                            similar_heatmap_image: row.similar_heatmap_image || null,
                                                            most_similar_in_label: row.most_similar_in_label || null,
                                                            similarity_score: row.similarity_score || null,
                                                        } 
                                                    })
                                                }}
                                            >
                                                View
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {!trainRows.length && (
                                    <tr><td colSpan={5} className="py-4 text-center text-slate-500">目前沒有資料列</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="mt-4">
                        {/* (from home(1)) 保留此按鈕觸發 TrainingModal */}
                        <button
                            className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:bg-slate-300"
                            disabled={!eligible.length}
                            onClick={() => setTrainOpen(true)}
                        >
                            Train Model ({eligible.length})
                        </button>
                    </div>
                </section>
            </main>

            {/* (from home(1)) Modals */}
            <BulkLabelModal
                bulkOpen={bulkOpen}
                bulkText={bulkText}
                bulkFile={bulkFile}
                bulkError={bulkError}
                setBulkOpen={setBulkOpen}
                setBulkText={setBulkText}
                setBulkFile={setBulkFile}
                parseBulk={parseBulk}
            />

            <TrainingModal
                trainOpen={trainOpen}
                training={training}
                eligible={eligible}
                selectedIds={selectedIds}
                selectAll={selectAll}
                toggleSelectAll={toggleSelectAll}
                toggleOne={toggleOne}
                startTraining={startTraining}
                setTrainOpen={setTrainOpen}
                trainCircleKey={trainCircleKey}
            />
            
            {/* ✨ (from home.jsx) 新增 LabelModal */}
            {labelModal.open && (
                <LabelModal
                    samples={labelModal.samples}
                    onClose={() => setLabelModal({ open: false, samples: [], labelFile: null })}
                    onConfirm={async (labels) => {
                        setLabelModal({ open: false, samples: [], labelFile: null });
                        setModelUpdateStatus("📤 正在通知 Space B 進行模型更新...");

                        try {
                            const params = new URLSearchParams({
                                label_file: labelModal.labelFile || "demo_label_file.json",
                                rnd: 1,
                            });
                            const resp = await fetch(`${SPACE_B_URL}/train-from-labeled?${params}`, {
                                method: "POST",
                            });
                            const js = await resp.json();
                            console.log("✅ Model retrained:", js);
                            setModelUpdateStatus("🎉 模型已完成更新！");
                        } catch (err) {
                            console.error("❌ update failed:", err);
                            setModelUpdateStatus("❌ 模型更新通知失敗");
                        }
                    }}
                />
            )}
        </div>
    );
}