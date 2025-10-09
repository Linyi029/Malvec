import React from "react";
import CircleProgress from "./CircleProgress";

export default function TrainingModal({
  trainOpen, training, eligible,
  selectedIds, selectAll,
  toggleSelectAll, toggleOne,
  startTraining, setTrainOpen,
  trainCircleKey
}) {
  if (!trainOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-xl w-[min(900px,94vw)] p-6">
        <div className="flex items-start justify-between">
          <h4 className="text-lg font-semibold">Select the files you would like to feed into the model</h4>
          <button className="text-slate-500 hover:text-slate-700" onClick={() => setTrainOpen(false)} disabled={training}>✕</button>
        </div>

        {!training ? (
          <>
            <div className="flex items-center justify-end my-2">
              <button
                className="px-3 py-1.5 rounded border border-slate-300 hover:bg-slate-50 text-sm"
                onClick={toggleSelectAll}
              >
                {selectAll ? "deselect all" : "select all"}
              </button>
            </div>
            <div className="max-h-[50vh] overflow-auto border rounded">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-white border-b">
                  <tr className="text-left text-slate-600">
                    <th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Filename</th>
                    <th className="py-2 px-3">Predicted</th>
                    <th className="py-2 px-3">True label</th>
                  </tr>
                </thead>
                <tbody>
                  {eligible.map(r => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 px-3">
                        <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleOne(r.id)} />
                      </td>
                      <td className="py-2 px-3 font-mono">{r.filename}</td>
                      <td className="py-2 px-3">{r.pred}</td>
                      <td className="py-2 px-3">{r.trueLabel}</td>
                    </tr>
                  ))}
                  {!eligible.length && (
                    <tr><td colSpan={4} className="py-4 text-center text-slate-500">沒有可用資料（需先填入 True label）</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-4">
              <button className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50" onClick={() => setTrainOpen(false)}>cancel</button>
              <button
                className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                disabled={!eligible.length}
                onClick={startTraining}
              >
                train the model
              </button>
            </div>
          </>
        ) : (
          <div className="py-10 flex flex-col items-center gap-4">
            <CircleProgress key={trainCircleKey} durationSec={10} status="active" size={128} />
            <div className="text-slate-700">Training in progress…</div>
          </div>
        )}
      </div>
    </div>
  );
}
