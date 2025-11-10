import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AnimatedBullets from "./components/AnimatedBullets";
import BulkLabelModal from "./components/BulkLabelModal";
import CircleProgress from "./components/CircleProgress";
import TopBar from "./components/TopBar";
import useFileProcessor from "./hooks/useFileProcessor";
import LabelModal from "./components/LabelModal.jsx";


/** ==========================
 *  設定標籤來源與顏色
 *  ========================== */
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

    // ===== Space B (Demo) =====
    const SPACE_B_URL = "https://lyi029-model-update-test.hf.space";
    const [labelModal, setLabelModal] = useState({
        open: false,
        samples: [],
        labelFile: null,
    });


    /** ===== 上傳與動畫流程 Hook ===== */
    const nextId = useRef(1);

    // Space A 的 URL（
    const SPACE_A_URL = "https://lyi029-test.hf.space";
    const [modelUpdateStatus, setModelUpdateStatus] = useState("");

    /** ===== 取得模型預測標籤 ===== */
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

    /** ===== 已分析檔案列表 ===== */
    const [trainRows, setTrainRows] = useState([]);

    // 🧩 初始化時從 localStorage 載入
    useEffect(() => {
        const saved = localStorage.getItem("malvec_train_rows");
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) setTrainRows(parsed);
            } catch { }
        }
    }, []);

    // 🧩 trainRows 改變時自動保存
    useEffect(() => {
        localStorage.setItem("malvec_train_rows", JSON.stringify(trainRows));
    }, [trainRows]);

    /** ===== 處理單一檔案完成 ===== */
    const handleFileDone = (fileResult) => {
        if (!fileResult || !fileResult.details) return;
        const det = fileResult.details;
        const passed = det.is_pe32 && det.is_exe && det.unpack_success;
        if (!passed) {
            console.log("❌ File did not pass all checks:", det);
            return;
        }

        const predictedLabel = getPredictedLabel(fileResult);
        const embedding = fileResult.embedding ||
            fileResult.prediction?.embedding?.values ||
            null;
        const embeddingInfo = fileResult.embeddingInfo || {
            dimension: embedding?.length || 0,
            source_file: fileResult.prediction?.embedding?.source_file || null,
            attention_score: fileResult.prediction?.embedding?.attention_score || 0
        };

        const id = nextId.current++;
        const newRow = {
            id,
            filename: fileResult.name,
            pred: predictedLabel,
            trueLabel: "-",
            details: fileResult.details,
            embedding: embedding,
            embeddingDimension: embedding?.length || 0,
            embeddingSource: embeddingInfo.source_file,
            attentionScore: embeddingInfo.attention_score,
            confidence: fileResult.prediction?.confidence || 0,
            attention_heatmap: fileResult.attention_heatmap || null,
            similar_heatmap_image: fileResult.similar_heatmap_image || null,
            most_similar_in_label: fileResult.most_similar_in_label || null,
            similarity_score: fileResult.similarity_score || null,
        };

        setTrainRows((prev) => [newRow, ...prev]);

        fetch(`${SPACE_A_URL}/check-new-samples`, { method: "POST" })
            .then(res => res.json())
            .then(js => {
                console.log("🚀 Triggered model check:", js);

                if (js.status === "need_labeling") {
                    setModelUpdateStatus(
                        `⚠️ 模型偵測高不確定性（entropy=${js.mean_entropy.toFixed(3)}），需要人工標註 ${js.samples_to_label.length} 筆樣本`
                    );
                    // 開啟人工標註彈窗
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


    };

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
        handleCircleDone,
    } = useFileProcessor({ onFileDone: handleFileDone });

    /** ===== 上傳事件 ===== */
    const onInputChange = (e) => handleFiles(e.target.files);
    const onDrop = (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); };

    const remaining = activeQueue.length > 0 ? activeQueue.length : 0;
    const total = activeQueue.length > 0 ? activeQueue.length : 0;

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
                        <div className="text-xs text-slate-500">支援多檔與整個資料夾上傳</div>
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

                        <span className="text-sm text-slate-500">或直接拖曳檔案到此區</span>
                    </div>

                    <div className="mt-4 text-sm text-slate-600">
                        {total ? `待處理檔案數：${remaining} / ${total}` : "尚未選擇檔案"}
                    </div>
                </section>

                {/* Bullet 動畫 */}
                <div className="xl:col-span-1">
                    <AnimatedBullets items={bulletItems} playKey={bulletPlayKey} title={bulletsTitle} />
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
                                    <CircleProgress durationSec={5} status={status} onDone={() => handleCircleDone(i)} />
                                    <div className="text-slate-700 text-sm">{label}</div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-3 text-xs text-slate-500">{processing ? bulletsTitle : ""}</div>
                </section>

                {/* 分析完成檔案列表 */}
                <section className="xl:col-span-3 bg-white border rounded-xl p-6 shadow-sm">
                    {modelUpdateStatus && (
                        <div className="text-sm text-slate-500 mb-3">{modelUpdateStatus}</div>
                    )}

                    <h3 className="text-lg font-semibold text-slate-800 mb-3">已分析完成</h3>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead>
                                <tr className="text-left text-slate-600 border-b">
                                    <th className="py-2 pr-4">Filename</th>
                                    <th className="py-2 pr-4">Predicted label</th>

                                    <th className="py-2 pr-4">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {trainRows.map(row => (
                                    <tr key={row.id} className="border-b last:border-b-0">
                                        <td className="py-2 pr-4 font-mono">{row.filename}</td>
                                        <td className="py-2 pr-4">{row.pred}</td>
                                        <td className="py-2 pr-4">
                                            <button
                                                className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                                                onClick={() => {
                                                    let heatmapData = row.attention_heatmap || row.prediction?.attention_heatmap || null;

                                                    if (heatmapData && typeof heatmapData === "object") {
                                                        // 若是物件，取出 Base64 或序列化
                                                        heatmapData = heatmapData.image || JSON.stringify(heatmapData);
                                                    }

                                                    const encodedHeatmap = heatmapData ? encodeURIComponent(heatmapData) : null;

                                                    navigate("/report", {
                                                        state: {
                                                            filename: row.filename,
                                                            predLabel: row.pred,
                                                            embedding: row.embedding,
                                                            embeddingSource: row.embeddingSource,
                                                            confidence: row.confidence,
                                                            attention_heatmap: encodedHeatmap,
                                                            similar_heatmap_image: row.similar_heatmap_image || null,     // ✅ 相似 heatmap
                                                            most_similar_in_label: row.most_similar_in_label || null,     // ✅ 相似檔案
                                                            similarity_score: row.similarity_score || null,               // ✅ 分數
                                                        },
                                                    });
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
                </section>
            </main>

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
