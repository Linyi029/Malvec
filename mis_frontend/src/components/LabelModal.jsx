import React, { useState } from "react";

export default function LabelModal({ samples = [], onClose, onConfirm }) {
  const [selectedLabels, setSelectedLabels] = useState({});

  const handleLabelChange = (filename, label) => {
    setSelectedLabels(prev => ({ ...prev, [filename]: label }));
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white p-6 rounded-xl shadow-lg w-[480px]">
        <h2 className="text-lg font-semibold mb-4 text-slate-800">
          人工標註樣本
        </h2>

        <div className="space-y-3 max-h-[300px] overflow-y-auto">
          {samples.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b pb-2"
            >
              <div className="font-mono text-sm text-slate-700">
                {s.source}
              </div>
              <input
                className="border rounded px-2 py-1 text-sm w-28"
                placeholder="輸入標籤"
                value={selectedLabels[s.source] || ""}
                onChange={(e) => handleLabelChange(s.source, e.target.value)}
              />
            </div>
          ))}
        </div>

        <div className="mt-4 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-slate-300 text-slate-800 hover:bg-slate-400"
          >
            取消
          </button>
          <button
            onClick={() => onConfirm(selectedLabels)}
            className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700"
          >
            提交標註
          </button>
        </div>
        
      </div>
    </div>
  );
}
