import React, { useEffect, useState } from 'react';
import { request } from './api.js';

export default function Crew({ lang = 'en', t = {} }) {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [activeClosureId, setActiveClosureId] = useState(null);
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  async function loadAssigned() {
    setLoading(true);
    setError('');
    try {
      const data = await request('/api/incidents?assigned=me');
      setIncidents(data.incidents || []);
    } catch (err) {
      setError(err.message || 'Unable to load assigned tasks.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAssigned();
    const timer = setInterval(loadAssigned, 10000);
    return () => clearInterval(timer);
  }, []);

  function handleFileChange(e) {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setPreviewUrl(URL.createObjectURL(selected));
    }
  }

  async function handleCloseIncident(incidentId) {
    if (!file) {
      setError('A physical verification photo is mandatory to close this hazard.');
      return;
    }
    setSubmitting(true);
    setError('');
    setActionMessage('');

    const formData = new FormData();
    formData.append('photo', file);
    formData.append('notes', notes || 'Hazard rectified on site.');

    try {
      const res = await fetch(`/api/incidents/${incidentId}/close`, {
        method: 'POST',
        headers: { 'X-Requested-With': 'CodeArena' },
        body: formData,
      });
      const text = await res.text();
      let data = {};
      if (text && text.trim().length > 0) {
        try { data = JSON.parse(text); } catch { data = { error: text }; }
      }
      if (!res.ok) throw new Error(data.error || 'Failed to close incident.');

      setActionMessage(lang === 'si' ? 'සිද්ධිය සාර්ථකව වසා දමා ඇත. රාජ්‍ය සිතියම සහ පුරවැසි තත්ත්ව යාවත්කාලීන කළා.' : 'Incident resolved and closed successfully. Public map and citizen statuses updated.');
      setActiveClosureId(null);
      setFile(null);
      setPreviewUrl('');
      setNotes('');
      await loadAssigned();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const [crewTab, setCrewTab] = useState('active');
  const activeJobs = incidents.filter(i => i.status !== 'closed');
  const closedJobs = incidents.filter(i => i.status === 'closed');

  return (
    <section className="panel mt-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">{lang === 'si' ? 'ක්ෂේත්‍ර කණ්ඩායම් මෙහෙයුම්' : 'FIELD CREW OPERATIONS'}</div>
          <h2>{lang === 'si' ? 'ක්ෂේත්‍ර රාජකාරි නියෝග' : 'Field Work Orders'}</h2>
          <p className="muted text-sm">{lang === 'si' ? 'තත්‍ය කාලීන කාර්ය පෝලිය · වසා දැමීමට භෞතික ඡායාරූප අනිවාර්යයි' : 'Real-time task queue · physical photo verification required for closure'}</p>
        </div>
        <button className="secondary" onClick={loadAssigned} disabled={loading}>{lang === 'si' ? 'නවීකරණය කරන්න' : 'Refresh Tasks'}</button>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mt-5 border-b border-slate-200 pb-3" role="tablist" aria-label="Crew categories">
        <button
          type="button"
          role="tab"
          aria-selected={crewTab === 'active'}
          onClick={() => setCrewTab('active')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            crewTab === 'active'
              ? 'bg-[#174b3c] text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>🚨</span>
          <span>{lang === 'si' ? 'සක්‍රීය යෙදවීම්' : 'Active Dispatches'}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${crewTab === 'active' ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
            {activeJobs.length}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={crewTab === 'closed'}
          onClick={() => setCrewTab('closed')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            crewTab === 'closed'
              ? 'bg-[#174b3c] text-white shadow-sm'
              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <span>✅</span>
          <span>{lang === 'si' ? 'නිරාකරණය කළ ඉතිහාසය' : 'Resolved & Reopened History'}</span>
          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${crewTab === 'closed' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
            {closedJobs.length}
          </span>
        </button>
      </div>

      {actionMessage && (
        <div role="status" className="notice mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800">
          {actionMessage}
        </div>
      )}

      {error && (
        <div role="alert" className="notice error mt-4">
          {error}
        </div>
      )}

      {loading && !incidents.length ? (
        <p role="status" className="py-8">{lang === 'si' ? 'පවරා ඇති ක්ෂේත්‍ර කාර්ය පූරණය වෙමින්…' : 'Loading assigned field tasks…'}</p>
      ) : (
        <div className="space-y-6 mt-6">
          {crewTab === 'active' && (
            <div>
            <h3 className="text-base font-bold text-slate-800 mb-3">
              {lang === 'si' ? `සක්‍රීය යෙදවීම් (${activeJobs.length})` : `Active Dispatches (${activeJobs.length})`}
            </h3>
            {!activeJobs.length ? (
              <div className="empty">
                <h4>{lang === 'si' ? 'ඔබගේ ක්ෂේත්‍ර ඒකකයට සක්‍රීය කාර්යයන් නොමැත' : 'No active tasks assigned to your crew unit'}</h4>
                <p className="muted">{lang === 'si' ? 'මෙහෙයුම් නිලධාරියෙකු ඔබේ ඒකකය යෙදවූ විට කාර්යයන් මෙහි දිස්වේ.' : 'Tasks will appear here when an Operations officer dispatches your unit.'}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {activeJobs.map(job => (
                  <div key={job._id} className="p-5 border border-slate-200 rounded-lg bg-white shadow-sm space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2 border-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="badge bg-amber-100 text-amber-900 border-amber-300 font-semibold uppercase">
                          {job.status}
                        </span>
                        <span className="font-bold text-slate-900">{job.title}</span>
                      </div>
                      <span className="text-xs text-slate-500">
                        {lang === 'si' ? 'යෙදවූ වේලාව: ' : 'Dispatched '}{new Date(job.dispatch?.dispatchedAt || job.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="space-y-1">
                        <div><strong className="text-slate-700">{lang === 'si' ? 'ස්ථානය:' : 'Location:'}</strong> {job.ward?.name} · {job.road?.name}</div>
                        <div><strong className="text-slate-700">{lang === 'si' ? 'ඛණ්ඩාංක:' : 'Coordinates:'}</strong> {job.center.latitude}, {job.center.longitude}</div>
                        <div><strong className="text-slate-700">{lang === 'si' ? 'ආපදා වර්ගය සහ බරපතළකම:' : 'Hazard & Severity:'}</strong> {job.hazardType} · {job.severity}</div>
                        <div><strong className="text-slate-700">{lang === 'si' ? 'මාර්ග තත්ත්වය:' : 'Road Status:'}</strong> {job.isRoadClosed ? (lang === 'si' ? 'ගමනාගමනයට වසා ඇත' : 'Closed to Traffic') : (lang === 'si' ? 'ගමන් කළ හැකිය' : 'Passable')}</div>
                      </div>
                      <div className="p-2.5 bg-slate-50 rounded border border-slate-200">
                        <strong className="block text-slate-700 mb-1">{lang === 'si' ? 'නිලධාරී උපදෙස්:' : 'Officer Instructions:'}</strong>
                        <p className="text-slate-800">{job.dispatch?.instructions || (lang === 'si' ? 'ප්‍රදේශය පරීක්ෂා කර ආපදා ඉවත් කර ජනතාවගේ ආරක්ෂාව තහවුරු කරන්න.' : 'Inspect area, clear hazards, and verify public safety.')}</p>
                      </div>
                    </div>

                    {activeClosureId === job._id ? (
                      <div className="p-4 bg-slate-50 border border-slate-300 rounded-lg space-y-3 mt-3">
                        <h4 className="text-sm font-bold text-slate-900">{lang === 'si' ? 'සිද්ධිය නිරාකරණය කර වසා දමන්න' : 'Resolve & Close Incident'}</h4>
                        <div>
                          <label htmlFor={`closure-photo-${job._id}`} className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'සම්පූර්ණ කිරීමේ ඡායාරූපය (අනිවාර්ය)' : 'Completion Photo (Mandatory verification photo)'}
                          </label>
                          <input
                            id={`closure-photo-${job._id}`}
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handleFileChange}
                            className="text-xs"
                          />
                        </div>

                        {previewUrl && (
                          <div className="w-40 h-28 bg-slate-200 rounded overflow-hidden">
                            <img src={previewUrl} alt="Closure verification preview" className="w-full h-full object-cover" />
                          </div>
                        )}

                        <div>
                          <label htmlFor={`closure-notes-${job._id}`} className="block text-xs font-semibold text-slate-700 mb-1">
                            {lang === 'si' ? 'නිරාකරණ සටහන්' : 'Resolution Notes'}
                          </label>
                          <textarea
                            id={`closure-notes-${job._id}`}
                            rows="2"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder={lang === 'si' ? 'ගත් පියවර විස්තර කරන්න (නිදසුන: ජලාපවහනය ඉවත් කළා, මාර්ගය නැවත විවෘත කළා)...' : 'Describe actions taken (e.g., culvert cleared, road dry and reopened)...'}
                            className="w-full text-xs p-2 border rounded"
                          />
                        </div>

                        <div className="flex gap-2">
                          <button
                            className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-semibold"
                            disabled={submitting}
                            onClick={() => handleCloseIncident(job._id)}
                          >
                             {submitting ? (lang === 'si' ? 'ඉදිරිපත් කරමින්…' : 'Submitting Closure…') : (lang === 'si' ? 'ඉදිරිපත් කර මාර්ගය නැවත විවෘත කරන්න' : 'Submit & Re-open Road')}
                          </button>
                          <button
                            className="secondary text-xs"
                            onClick={() => { setActiveClosureId(null); setFile(null); setPreviewUrl(''); }}
                          >
                            {lang === 'si' ? 'අවලංගු කරන්න' : 'Cancel'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="pt-2">
                        <button
                          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-semibold"
                          onClick={() => { setActiveClosureId(job._id); setNotes(''); setFile(null); setPreviewUrl(''); }}
                        >
                          {lang === 'si' ? 'කාර්යය සම්පූර්ණ කර ඡායාරූපය යොමු කරන්න' : 'Complete Job & Upload Photo'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {crewTab === 'closed' && (
            <div>
              <h3 className="text-base font-bold text-slate-800 mb-3">{lang === 'si' ? `මෑතකදී වසා දැමූ කාර්යයන් (${closedJobs.length})` : `Recently Closed Jobs (${closedJobs.length})`}</h3>
              {!closedJobs.length ? (
                <div className="empty text-center py-8">
                  <h4 className="text-sm font-semibold text-slate-700">{lang === 'si' ? 'තවම වසා දැමූ කාර්යයන් නොමැත' : 'No closed jobs yet'}</h4>
                  <p className="muted text-xs">{lang === 'si' ? 'අනිවාර්ය ඡායාරූප සහිත සම්පූර්ණ කළ කාර්යයන් මෙහි දිස්වේ.' : 'Completed tasks with mandatory closure photos will appear in this audit list.'}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {closedJobs.map(job => (
                    <div key={job._id} className="p-3 border border-slate-200 rounded-lg bg-white shadow-2xs flex items-center justify-between text-xs">
                      <div>
                        <span className="badge bg-emerald-100 text-emerald-800 font-semibold mr-2">RESOLVED</span>
                        <strong className="text-slate-800">{job.title}</strong> · {job.ward?.name}
                        <p className="text-slate-500 mt-1">{job.closure?.notes}</p>
                      </div>
                      {job.closure?.photo?.url && (
                        <a href={job.closure.photo.url} target="_blank" rel="noreferrer" className="text-blue-600 underline font-semibold">
                          {lang === 'si' ? 'සත්‍යාපන ඡායාරූපය බලන්න →' : 'View Verification Photo →'}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
