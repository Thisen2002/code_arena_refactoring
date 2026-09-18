import { useEffect, useState } from 'react';
import { request } from './api.js';
import ReportMap from './ReportMap.jsx';
import CaseModal from './CaseModal.jsx';
import CitizenReportModal from './CitizenReportModal.jsx';

export default function ReportQueue({ title = 'Report inbox', refreshKey = 0, helpOnly = false, own = false }) {
  const [state, setState] = useState({ reports: [], loading: true, error: '', hasMore: false });
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [kind, setKind] = useState(helpOnly ? 'help' : '');
  const [selectedReport, setSelectedReport] = useState(null);

  useEffect(() => { setOffset(0); }, [refreshKey]);
  useEffect(() => {
    let active = true; let running = false;
    const controller = new AbortController();
    async function load(initial = false) {
      if (running) return;
      running = true;
      if (initial) setState(s => ({ ...s, loading: true, error: '' }));
      try {
        const data = await request(`/api/reports?limit=20&offset=${offset}${kind ? `&kind=${kind}` : ''}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        if (active) setState({ ...data, loading: false, error: '' });
      } catch (error) { if (active) setState({ reports: [], loading: false, error: error.message, hasMore: false }); }
      finally { running = false; }
    }
    load(true);
    const timer = setInterval(() => { if (!document.hidden) load(); }, 10000);
    return () => { active = false; controller.abort(); clearInterval(timer); };
  }, [offset, refresh, refreshKey, kind]);

  const [showMap, setShowMap] = useState(true);

  function downloadSitrepCSV() {
    if (!state.reports.length) return;
    const headers = ['ReportID', 'Kind', 'Status', 'CreatedAt', 'Latitude', 'Longitude', 'LocationSource', 'Verdict', 'Urgency', 'Description'];
    const rows = state.reports.map(r => [
      `"${r._id}"`,
      `"${r.kind}"`,
      `"${r.status}"`,
      `"${new Date(r.createdAt).toISOString()}"`,
      r.latitude,
      r.longitude,
      `"${r.locationSource || 'manual'}"`,
      `"${r.assessment?.aggregator?.verdict || 'pending'}"`,
      `"${r.assessment?.aggregator?.urgency || 'pending'}"`,
      `"${(r.description || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `sitrep_operations_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return <section className="panel mt-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="eyebrow">{own ? 'YOUR SUBMISSIONS' : 'OPERATIONS'}</div>
        <h2>{title}</h2>
        <p className="muted text-sm">{own ? 'Track your reported hazards, requests, and emergency resolution progress' : 'Newest first · auto-refreshes · 5-check AI & rule verification pipeline'}</p>
      </div>
      <div className="flex items-center gap-2">
        {!own && state.reports.length > 0 && (
          <button
            type="button"
            className="secondary text-xs flex items-center gap-1.5"
            onClick={downloadSitrepCSV}
            title="Download operational situation report as CSV"
          >
            <span>📥</span> Export Sitrep CSV
          </button>
        )}
        <button
          type="button"
          className="secondary text-xs"
          onClick={() => setShowMap(v => !v)}
        >
          {showMap ? '🗺️ Hide Map' : '🗺️ Show Map'}
        </button>
        <button className="secondary text-xs" disabled={state.loading} onClick={() => setRefresh(n => n + 1)}>
          Refresh
        </button>
      </div>
    </div>

    {/* Quick Category Filter Tabs */}
    {!helpOnly && (
      <div className="flex flex-wrap gap-2 mt-4 border-b border-slate-200 pb-3" role="tablist" aria-label="Report filter categories">
        {[
          { id: '', label: 'All Submissions', icon: '📋' },
          { id: 'hazard', label: 'Hazards Only', icon: '⚠️' },
          { id: 'help', label: 'Help Requests Only', icon: '🆘' },
        ].map(tab => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={kind === tab.id}
            onClick={() => { setKind(tab.id); setOffset(0); }}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
              kind === tab.id
                ? 'bg-[#174b3c] text-white shadow-xs'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
    )}

    {state.loading ? <p role="status" className="py-8">{own ? 'Loading your submissions…' : 'Loading reports…'}</p> : state.error ? <p role="alert" className="notice error mt-5">{state.error}</p> : <>
      {showMap && <ReportMap reports={state.reports} label={own ? 'Private map of your reports on this page' : 'Private queue map of reports on this page'} />}
      {!state.reports.length ? <div className="empty"><h3>No reports on this page</h3><p className="muted">{own ? 'You have not submitted any reports or help requests yet.' : 'No demonstration hazard records are inserted automatically.'}</p></div> : <ul className="divide-y divide-slate-200">{state.reports.map(report => <li key={report._id} className="py-5"><div className="flex flex-wrap justify-between gap-2"><span className="badge">{report.kind === 'help' ? `Help · ${report.helpCategory || 'other'}` : 'Hazard'} · {report.status}</span><time className="muted text-xs" dateTime={report.createdAt}>{new Date(report.createdAt).toLocaleString()}</time></div>
        <div className="report-row"><div className="min-w-0"><p className="my-3 whitespace-pre-wrap break-words">{report.description}</p><p className="muted text-sm">{report.latitude}, {report.longitude} · {report.locationSource === 'device' ? 'Device-supplied' : 'Manually entered'} · unverified{report.gpsAccuracy !== undefined ? ` · reported accuracy ${Math.round(report.gpsAccuracy)} m` : ''}</p><p className="muted text-xs mt-2">Photo GPS evidence: {report.photo?.exifGps ? 'metadata present, not verified' : 'unknown / not available'}</p><p className="muted text-xs mt-2 break-all">Reference: {report._id.slice(-8)}</p>{report.legacy && <p className="muted text-xs">Legacy foundation report: preserved for staff review.</p>}
        <div className="flex flex-wrap items-center gap-2 mt-3 pt-2 border-t border-slate-100">
          {!own && (report.assessment?.status === 'evaluated' ? <>
            <span className={`badge text-xs font-bold uppercase ${
              report.assessment.aggregator?.verdict === 'confirmed' ? 'bg-emerald-600 text-white' :
              report.assessment.aggregator?.verdict === 'needs_verification' ? 'bg-amber-600 text-white' :
              'bg-slate-600 text-white'
            }`}>
              {report.assessment.aggregator?.verdict?.replace('_', ' ')}
            </span>
            <span className="badge text-xs bg-red-50 text-red-700 border-red-200 font-medium">
              Urgency: {report.assessment.aggregator?.urgency}
            </span>
            <span className="badge text-xs bg-blue-50 text-blue-700 border-blue-200 font-medium">
              Confidence: {Math.round((report.assessment.aggregator?.confidence || 0) * 100)}% (uncalibrated)
            </span>
          </> : report.assessment?.status === 'failed' ? (
            <span className="badge text-xs bg-rose-50 text-rose-700 border-rose-300 font-medium">
              Review required
            </span>
          ) : (
            <span className="badge text-xs bg-slate-100 text-slate-500 font-medium">
              Unassessed
            </span>
          ))}
          <button
            type="button"
            className="secondary text-xs px-2.5 py-1 ml-auto"
            onClick={() => setSelectedReport(report)}
          >
            {own ? 'View Status & Details →' : (report.assessment?.status === 'evaluated' ? 'Inspect 5-check case' : 'Assess case')}
          </button>
        </div>
        </div>{report.photo ? <a href={report.photo.url} target="_blank" rel="noreferrer" aria-label="Open original report photo"><img loading="lazy" className="report-photo" src={report.photo.url} alt="Submitted evidence" /></a> : <p className="muted text-xs">No photo in this record.</p>}</div></li>)}</ul>}
    </>}
    <div className="flex gap-3 mt-5"><button className="secondary" disabled={offset === 0 || state.loading} onClick={() => setOffset(n => Math.max(0, n - 20))}>Previous</button><button className="secondary" disabled={!state.hasMore || state.loading} onClick={() => setOffset(n => n + 20)}>Next</button></div>
    {selectedReport && (
      own ? (
        <CitizenReportModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
        />
      ) : (
        <CaseModal
          report={selectedReport}
          onClose={() => setSelectedReport(null)}
          onUpdated={updated => {
            setSelectedReport(updated);
            setState(s => ({
              ...s,
              reports: s.reports.map(r => r._id === updated._id ? updated : r),
            }));
          }}
        />
      )
    )}
  </section>;
}
