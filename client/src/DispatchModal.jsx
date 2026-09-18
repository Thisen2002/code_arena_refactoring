import React, { useState, useEffect } from 'react';
import { request } from './api.js';

export default function DispatchModal({ report, incident, onClose, onDispatched }) {
  const [title, setTitle] = useState(incident?.title || `Operational Hazard: ${report?.description?.slice(0, 50)}…`);
  const [instructions, setInstructions] = useState('Inspect site, clear blockages, and ensure public road safety.');
  const [markRoadClosed, setMarkRoadClosed] = useState(incident ? incident.isRoadClosed : true);
  const [crews, setCrews] = useState([]);
  const [selectedCrewId, setSelectedCrewId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    request('/api/incidents/crews')
      .then(data => {
        if (!active) return;
        const list = data.crews || [];
        setCrews(list);
        if (list.length > 0) {
          setSelectedCrewId(list[0]._id);
        }
      })
      .catch(err => {
        if (active) setError(err.message || 'Unable to load field crew list.');
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  async function handleDispatch(e) {
    e.preventDefault();
    if (!selectedCrewId && crews.length === 0) {
      setError('No field crew units available for dispatch.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      let targetIncidentId = incident?._id || report?.incidentId;

      // If opening from an unlinked report, create the incident first
      if (!targetIncidentId) {
        const createRes = await request('/api/incidents', {
          method: 'POST',
          body: JSON.stringify({
            title,
            hazardType: report?.kind === 'help' ? 'other' : 'flood',
            severity: 'severe',
            isRoadClosed: markRoadClosed,
            reportIds: [report._id],
            initialReportStatus: 'confirmed',
          }),
        });
        targetIncidentId = createRes.incident._id;
        if (report) {
          report.incidentId = targetIncidentId;
          report.status = 'confirmed';
        }
      }

      // Dispatch to chosen crew
      const dispatchRes = await request(`/api/incidents/${targetIncidentId}/dispatch`, {
        method: 'POST',
        body: JSON.stringify({
          crewId: selectedCrewId,
          instructions,
          markRoadClosed,
        }),
      });

      if (onDispatched) onDispatched(dispatchRes.incident);
      onClose();
    } catch (err) {
      setError(err.message || 'Dispatch failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dispatch-modal-title"
    >
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 id="dispatch-modal-title" className="font-bold text-lg text-slate-900">
            Dispatch Emergency Field Crew
          </h3>
          <button className="secondary text-xs" onClick={onClose} aria-label="Close dispatch dialog">✕</button>
        </div>

        {error && <div role="alert" className="notice error">{error}</div>}

        <form onSubmit={handleDispatch} className="space-y-4">
          {!incident && !report?.incidentId && (
            <div>
              <label htmlFor="dispatch-title" className="block text-xs font-semibold text-slate-700 mb-1">
                Operational Incident Title
              </label>
              <input
                id="dispatch-title"
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full text-xs p-2 border rounded"
              />
            </div>
          )}

          <div>
            <label htmlFor="dispatch-crew" className="block text-xs font-semibold text-slate-700 mb-1">
              Field Crew Unit
            </label>
            <select
              id="dispatch-crew"
              value={selectedCrewId}
              onChange={e => setSelectedCrewId(e.target.value)}
              className="w-full text-xs p-2 border rounded"
              required
            >
              {crews.length === 0 ? (
                <option value="">Loading responders…</option>
              ) : (
                crews.map(c => (
                  <option key={c._id} value={c._id}>
                    {c.username} (Field Crew Responder)
                  </option>
                ))
              )}
            </select>
          </div>

          <div>
            <label htmlFor="dispatch-instructions" className="block text-xs font-semibold text-slate-700 mb-1">
              Mission Instructions
            </label>
            <textarea
              id="dispatch-instructions"
              rows="3"
              value={instructions}
              onChange={e => setInstructions(e.target.value)}
              className="w-full text-xs p-2 border rounded"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              id="road-closure-toggle"
              type="checkbox"
              checked={markRoadClosed}
              onChange={e => setMarkRoadClosed(e.target.checked)}
              className="rounded text-blue-600"
            />
            <label htmlFor="road-closure-toggle" className="text-xs text-slate-800 font-medium">
              Mark this corridor closed to traffic (Dynamically triggers safe Dijkstra rerouting)
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t">
            <button type="button" className="secondary text-xs" onClick={onClose}>Cancel</button>
            <button
              type="submit"
              disabled={loading || (!selectedCrewId && crews.length === 0)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded text-xs font-semibold"
            >
              {loading ? 'Dispatching…' : 'Confirm Crew Dispatch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
