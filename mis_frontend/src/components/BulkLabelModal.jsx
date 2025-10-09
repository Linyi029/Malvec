import React from "react";

export default function BulkLabelModal({
  bulkOpen, bulkText, bulkFile, bulkError,
  setBulkOpen, setBulkText, setBulkFile,
  parseBulk
}) {
  if (!bulkOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-xl w-[min(720px,92vw)] p-6">
        <div className="flex items-start justify-between">
          <h4 className="text-lg font-semibold">批次上傳真實標籤</h4>
          <button className="text-slate-500 hover:text-slate-700" onClick={() => setBulkOpen(false)}>✕</button>
        </div>
        <p className="text-sm text-slate-600 mt-2">
          JSON 格式：
          <code className="bg-slate-100 px-1 py-0.5 rounded">
            [{`{`}filename:"a.exe", true_label:"trojan"{`}`}]
          </code>
        </p>
        <div className="mt-4 space-y-3">
          <textarea
            rows={8}
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            className="w-full border rounded-lg p-3 font-mono text-sm"
            placeholder='[{"filename":"a.exe","true_label":"trojan"}]'
          />
          <div className="flex items-center gap-3">
            <input type="file" accept=".json,application/json" onChange={(e) => setBulkFile(e.target.files?.[0] ?? null)} />
            <button className="px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700" onClick={parseBulk}>
              確認
            </button>
          </div>
          {bulkError && <div className="text-red-600 text-sm">{bulkError}</div>}
        </div>
      </div>
    </div>
  );
}
