import React, { useEffect } from 'react';

export default function CitizenReportModal({ report, onClose }) {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!report) return null;

  const isHelp = report.kind === 'help';
  const status = report.status || 'submitted';

  const steps = [
    { key: 'submitted', label: '1. Received', done: true },
    { key: 'under_review', label: '2. Triaged', done: ['under_review', 'confirmed', 'resolved'].includes(status) },
    { key: 'confirmed', label: '3. Dispatched', done: ['confirmed', 'resolved'].includes(status) },
    { key: 'resolved', label: '4. Cleared', done: status === 'resolved' },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="citizen-modal-title"
    >
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <span className="badge text-xs font-semibold uppercase tracking-wider bg-sky-100 text-sky-900">
              {isHelp ? `Help Request · ${report.helpCategory || 'General'}` : 'Hazard Report'}
            </span>
            <h2 id="citizen-modal-title" className="text-lg font-bold text-slate-900 mt-1">
              Submission Status & Updates
            </h2>
            <p className="text-xs text-slate-500">
              Submitted {new Date(report.createdAt).toLocaleString()} · Reference: {report._id?.slice(-8)}
            </p>
          </div>
          <button
            type="button"
            className="secondary text-xs p-2 rounded-lg"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Progress Tracker */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-3">
              Response Progression
            </span>
            <div className="grid grid-cols-4 gap-2 text-center text-xs">
              {steps.map(s => (
                <div key={s.key} className="space-y-1.5">
                  <div
                    className={`h-2 rounded-full ${
                      s.done ? 'bg-emerald-600' : 'bg-slate-200'
                    }`}
                  />
                  <span className={`block font-medium text-[11px] ${s.done ? 'text-slate-900 font-bold' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Current Status Explanation */}
          <div className="p-4 rounded-xl border bg-white space-y-2">
            <div className="flex items-center gap-2">
              <span
                className={`badge text-xs font-bold uppercase ${
                  status === 'resolved'
                    ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                    : status === 'confirmed'
                    ? 'bg-blue-100 text-blue-900 border-blue-300'
                    : 'bg-amber-100 text-amber-900 border-amber-300'
                }`}
              >
                Status: {status.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {status === 'resolved'
                ? 'Field crews have cleared this hazard on site. The corridor has been verified and reopened to normal traffic.'
                : status === 'confirmed'
                ? 'Emergency responders have confirmed this report. An operational unit has been dispatched to coordinate clearance and public safety.'
                : 'Your submission has been safely recorded. Emergency operations monitors local incoming reports alongside river gauge telemetry.'}
            </p>
          </div>

          {/* Report Summary */}
          <div className="space-y-2 text-xs">
            <strong className="block text-slate-800">Submitted Description:</strong>
            <p className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap">
              {report.description}
            </p>
          </div>

          {/* Photo Evidence */}
          {(report.photo?.url || report.extraPhotos?.length > 0) && (
            <div className="space-y-2 text-xs">
              <strong className="block text-slate-800">Your Photo Evidence:</strong>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {report.photo?.url && (
                  <div className="max-h-56 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                    <img
                      src={report.photo.url}
                      alt="Your submitted photo evidence"
                      className="max-h-56 w-auto object-contain"
                    />
                  </div>
                )}
                {report.extraPhotos?.map((p, i) => (
                  <div key={i} className="max-h-56 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100 flex items-center justify-center">
                    <img
                      src={p.url}
                      alt={`Extra photo ${i + 1}`}
                      className="max-h-56 w-auto object-contain"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Relief Assignment if Help */}
          {report.reliefAssignment?.status === 'assigned' && (
            <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl text-xs space-y-1">
              <span className="font-bold text-purple-900 block">✓ Evacuation Shelter Allocated</span>
              <p className="text-purple-800">
                You and your household ({report.reliefAssignment.partySize} pax) have been allocated space at{' '}
                <strong>{report.reliefAssignment.shelterName}</strong>.
              </p>
            </div>
          )}

          {/* Notice */}
          <div className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100">
            Reports are verified by authorized civil defence and emergency responders. In life-threatening emergencies, dial 117 (Disaster Management Centre) or 119 (Emergency Police).
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 flex justify-end bg-slate-50">
          <button type="button" className="secondary text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
