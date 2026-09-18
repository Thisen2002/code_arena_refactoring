import { useState, useEffect } from 'react';
import { request } from './api.js';

export default function Relief() {
  const [shelters, setShelters] = useState([]);
  const [helpReports, setHelpReports] = useState([]);
  const [feedStatus, setFeedStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [assigningReport, setAssigningReport] = useState(null);
  const [selectedShelterId, setSelectedShelterId] = useState('');
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState('');
  const [actionMessage, setActionMessage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadData() {
    try {
      const [shelterRes, reportRes, feedRes] = await Promise.all([
        request('/api/relief/shelters'),
        request('/api/reports?kind=help&limit=50'),
        request('/api/feed/status'),
      ]);
      setShelters(shelterRes.shelters || []);
      setHelpReports(reportRes.reports || []);
      setFeedStatus(feedRes);
    } catch (err) {
      console.error('Failed to load relief data:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  async function changeFeedStage(targetStage) {
    try {
      await request('/api/feed/step', {
        method: 'POST',
        body: JSON.stringify({ stage: targetStage }),
      });
      await loadData();
      setActionMessage({
        success: true,
        text: `Hydrological simulation set to Stage ${targetStage}. Gauges and warning triggers updated.`,
      });
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    }
  }

  function isCriticalTriage(desc = '', category = '') {
    const text = (desc + ' ' + category).toLowerCase();
    return /elderly|infant|baby|child|pregnant|medical|insulin|heart|oxygen|stranded|roof|drowning|trapped|disabled|stroke|urgent/.test(text);
  }

  function downloadShelterManifestCSV() {
    if (!shelters.length) return;
    const headers = ['ShelterID', 'Name', 'Ward', 'Status', 'CurrentOccupancy', 'MaxCapacity', 'RemainingCapacity', 'OccupancyPercent', 'Warden', 'ContactPhone'];
    const rows = shelters.map(s => [
      `"${s._id}"`,
      `"${s.name}"`,
      `"${s.wardName}"`,
      `"${s.status}"`,
      s.currentOccupancy,
      s.maxCapacity,
      s.remainingCapacity,
      `"${s.occupancyPercentage}%"`,
      `"${s.contactPerson}"`,
      `"${s.contactPhone}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `shelter_manifest_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function stepIncrease() {
    if (feedStatus && feedStatus.stage < 3) {
      changeFeedStage(feedStatus.stage + 1);
    }
  }

  function stepDecrease() {
    if (feedStatus && feedStatus.stage > 0) {
      changeFeedStage(feedStatus.stage - 1);
    }
  }

  async function resetFeed() {
    try {
      await request('/api/feed/reset', { method: 'POST' });
      await loadData();
      setActionMessage({ success: true, text: 'Reset hydrological feed to baseline Stage 0.' });
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    }
  }

  async function handleAssign(e) {
    e.preventDefault();
    if (!assigningReport || !selectedShelterId) return;
    setSubmitting(true);
    setActionMessage(null);
    try {
      const res = await request('/api/relief/assign', {
        method: 'POST',
        body: JSON.stringify({
          reportId: assigningReport._id,
          shelterId: selectedShelterId,
          partySize: Number(partySize) || 1,
          notes,
        }),
      });
      setActionMessage({ success: true, text: `Successfully allocated to ${res.shelter.name}.` });
      setAssigningReport(null);
      setSelectedShelterId('');
      setPartySize(1);
      setNotes('');
      await loadData();
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  const totalCapacity = shelters.reduce((sum, s) => sum + s.maxCapacity, 0);
  const totalOccupancy = shelters.reduce((sum, s) => sum + s.currentOccupancy, 0);
  const totalAvailable = Math.max(0, totalCapacity - totalOccupancy);
  const overallOccupancyPct = totalCapacity > 0 ? Math.round((totalOccupancy / totalCapacity) * 100) : 0;

  const [reliefTab, setReliefTab] = useState('shelters'); // 'shelters' | 'requests' | 'river'
  const unassignedCount = helpReports.filter(r => r.reliefAssignment?.status !== 'assigned').length;

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading Relief Coordination Desk…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Hydrological Simulation Bar */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge bg-amber-400 text-slate-950 font-bold text-xs">M5 RELIEF DESK</span>
              <h2 className="text-xl font-bold text-white">Emergency Shelter & Evacuation Coordination</h2>
            </div>
            <p className="text-xs text-slate-300">
              Live capacity tracking across simulated Colombo Municipal Council & Kelani flood shelters.
            </p>
          </div>

          {/* Quick River Feed Status Badge */}
          {feedStatus && (
            <div className="bg-slate-800 border border-slate-700 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs">
              <span className="text-slate-400">River Stage:</span>
              <strong className="text-amber-300 font-mono">
                Stage {feedStatus.stage}: {feedStatus.stageName}
              </strong>
            </div>
          )}
        </div>

        {/* Global Capacity Overview KPI */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-800 text-center">
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <span className="text-slate-400 text-xs block">Shelters Monitored</span>
            <strong className="text-lg text-white">{shelters.length}</strong>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <span className="text-slate-400 text-xs block">Total Capacity</span>
            <strong className="text-lg text-white">{totalCapacity}</strong>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <span className="text-slate-400 text-xs block">Current Occupancy</span>
            <strong className="text-lg text-amber-300">{totalOccupancy} ({overallOccupancyPct}%)</strong>
          </div>
          <div className="bg-slate-800/60 p-3 rounded-lg">
            <span className="text-slate-400 text-xs block">Available Spaces</span>
            <strong className="text-lg text-emerald-400">{totalAvailable}</strong>
          </div>
        </div>
      </div>

      {/* Category Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Relief categories">
          <button
            type="button"
            role="tab"
            aria-selected={reliefTab === 'shelters'}
            onClick={() => setReliefTab('shelters')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              reliefTab === 'shelters'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🏥</span>
            <span>Evacuation Shelters & Resources</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${reliefTab === 'shelters' ? 'bg-emerald-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
              {shelters.length}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reliefTab === 'requests'}
            onClick={() => setReliefTab('requests')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              reliefTab === 'requests'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🆘</span>
            <span>Citizen Help Queue</span>
            <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${unassignedCount > 0 ? 'bg-amber-400 text-slate-950' : 'bg-slate-200 text-slate-700'}`}>
              {unassignedCount} pending
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={reliefTab === 'river'}
            onClick={() => setReliefTab('river')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              reliefTab === 'river'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🌊</span>
            <span>River Hydrological Simulation</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-lg text-xs font-semibold ${
            actionMessage.error
              ? 'bg-rose-100 text-rose-800 border border-rose-300'
              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {/* Tab 1: Shelters Grid */}
      {reliefTab === 'shelters' && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-base text-slate-800">Designated Evacuation Shelters</h3>
          <div className="flex items-center gap-3">
            {shelters.length > 0 && (
              <button
                type="button"
                onClick={downloadShelterManifestCSV}
                className="secondary text-xs flex items-center gap-1.5"
                title="Download shelter capacity manifest as CSV"
              >
                <span>📥</span> Export Manifest CSV
              </button>
            )}
            <button
              type="button"
              onClick={() => setReliefTab('requests')}
              className="text-xs text-sky-800 font-semibold underline hover:no-underline"
            >
              Match Help Requests ({unassignedCount} waiting) →
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {shelters.map(shelter => {
            const pct = shelter.occupancyPercentage;
            const barColor = pct >= 90 ? 'bg-rose-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
            const statusBadge =
              shelter.status === 'full'
                ? 'bg-rose-100 text-rose-800 border-rose-300'
                : shelter.status === 'near_capacity'
                ? 'bg-amber-100 text-amber-800 border-amber-300'
                : shelter.status === 'closed'
                ? 'bg-slate-200 text-slate-700'
                : 'bg-emerald-100 text-emerald-800 border-emerald-300';

            return (
              <div key={shelter._id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 leading-tight">{shelter.name}</h4>
                    <span className="text-xs text-slate-500 block">{shelter.wardName}</span>
                  </div>
                  <span className={`badge text-[11px] font-bold ${statusBadge}`}>
                    {shelter.status.toUpperCase()}
                  </span>
                </div>

                {/* Capacity Progress Bar */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Occupancy</span>
                    <strong>
                      {shelter.currentOccupancy} / {shelter.maxCapacity} ({pct}%)
                    </strong>
                  </div>
                  <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>

                {/* Resources Checklist */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-1.5 text-[11px]">
                  {shelter.resources?.cleanWater && (
                    <span className="px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-200 rounded">💧 Water</span>
                  )}
                  {shelter.resources?.foodRations && (
                    <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded">🍲 Rations</span>
                  )}
                  {shelter.resources?.medicalFirstAid && (
                    <span className="px-1.5 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded">🩺 First Aid</span>
                  )}
                  {shelter.resources?.beddingPacks && (
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded">🛏️ Bedding</span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 flex justify-between pt-1">
                  <span>Warden: {shelter.contactPerson}</span>
                  <span>{shelter.contactPhone}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      )}

      {/* Tab 2: Citizen Help Requests Intake Queue */}
      {reliefTab === 'requests' && (
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-bold text-base text-slate-800">
              Citizen Help Requests Intake Queue ({helpReports.length})
            </h3>
            <p className="text-xs text-slate-500">Unallocated requests requiring shelter evacuation assignment</p>
          </div>
          <span className="text-xs text-slate-500 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            Role: Relief Coordinator
          </span>
        </div>

        {helpReports.length === 0 ? (
          <div className="p-8 bg-slate-50 border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
            No active help requests pending in the queue.
          </div>
        ) : (
          <div className="space-y-3">
            {helpReports.map(report => {
              const isAssigned = report.reliefAssignment?.status === 'assigned';
              return (
                <div
                  key={report._id}
                  className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="badge bg-purple-100 text-purple-800 border-purple-300 text-xs font-bold uppercase">
                        {report.helpCategory || 'Help'}
                      </span>
                      {isCriticalTriage(report.description, report.helpCategory) && (
                        <span className="badge bg-rose-600 text-white text-[11px] font-extrabold tracking-wide uppercase shadow-2xs animate-pulse">
                          🚨 Critical Triage Priority
                        </span>
                      )}
                      <span className="text-xs font-mono text-slate-400">ID: {report._id}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(report.createdAt).toLocaleTimeString()}
                      </span>
                      {isAssigned && (
                        <span className="badge bg-emerald-100 text-emerald-800 border-emerald-300 text-xs">
                          Assigned to: {report.reliefAssignment.shelterName} ({report.reliefAssignment.partySize} pax)
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-800 line-clamp-2">{report.description}</p>
                    <div className="text-[11px] text-slate-500">
                      Location: {report.latitude?.toFixed(4)}, {report.longitude?.toFixed(4)} ({report.locationSource})
                    </div>
                  </div>

                  <div>
                    {!isAssigned ? (
                      <button
                        onClick={() => {
                          setAssigningReport(report);
                          setSelectedShelterId(shelters[0]?._id || '');
                        }}
                        className="px-3 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs"
                      >
                        Assign Shelter
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-700 font-semibold flex items-center gap-1">
                        ✓ Shelter Allocated
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Tab 3: Hydrological River Monitor & Feed Controls */}
      {reliefTab === 'river' && (
        <section className="panel space-y-5">
          <div>
            <div className="eyebrow">R02 · HYDROLOGICAL SENSOR SIMULATION</div>
            <h2>Kelani River Basin Stream Feed</h2>
            <p className="muted text-sm">
              Simulated hydrological stream gauge network triggering upstream surge advisories, minor flood spillage, and major flood inundation alerts.
            </p>
          </div>

          {feedStatus && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span className="text-xs text-slate-500 uppercase tracking-wider font-bold">Active Replay State</span>
                  <div className="text-xl font-extrabold text-slate-900 mt-0.5">
                    Stage {feedStatus.stage}: {feedStatus.stageName}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={stepDecrease}
                    disabled={feedStatus.stage === 0}
                    className="px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-100 disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
                    title="Recede flood waters gradually to previous stage"
                  >
                    ← Recede River Level
                  </button>
                  <button
                    type="button"
                    onClick={stepIncrease}
                    disabled={feedStatus.stage >= 3}
                    className="px-3.5 py-2 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg disabled:opacity-40 disabled:pointer-events-none shadow-2xs"
                    title="Advance flood waters gradually to next stage"
                  >
                    Surge River Level →
                  </button>
                  <button
                    type="button"
                    onClick={resetFeed}
                    className="secondary text-xs"
                    title="Instantly reset to dry normal conditions"
                  >
                    Reset (Stage 0)
                  </button>
                </div>
              </div>

              {/* Interactive Stage Selector Cards */}
              <div className="space-y-1.5 pt-2 border-t border-slate-200">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Direct Stage Selection · Click any stage card to transition river conditions:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => changeFeedStage(0)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      feedStatus.stage === 0
                        ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="block text-slate-900 font-bold">Stage 0 · Normal</strong>
                      {feedStatus.stage === 0 && (
                        <span className="text-[10px] font-extrabold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-slate-600 block mt-1">Gauge 3.5 ft · Dry baseline</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeFeedStage(1)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      feedStatus.stage === 1
                        ? 'bg-amber-50 border-amber-500 ring-2 ring-amber-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="block text-slate-900 font-bold">Stage 1 · Advisory</strong>
                      {feedStatus.stage === 1 && (
                        <span className="text-[10px] font-extrabold bg-amber-600 text-white px-1.5 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-slate-600 block mt-1">Gauge 5.2 ft · Alert breached</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeFeedStage(2)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      feedStatus.stage === 2
                        ? 'bg-orange-50 border-orange-500 ring-2 ring-orange-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="block text-slate-900 font-bold">Stage 2 · Minor Flood</strong>
                      {feedStatus.stage === 2 && (
                        <span className="text-[10px] font-extrabold bg-orange-600 text-white px-1.5 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-slate-600 block mt-1">Gauge 7.2 ft · Lowland spill</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => changeFeedStage(3)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      feedStatus.stage === 3
                        ? 'bg-rose-50 border-rose-500 ring-2 ring-rose-300 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <strong className="block text-slate-900 font-bold">Stage 3 · Major Flood</strong>
                      {feedStatus.stage === 3 && (
                        <span className="text-[10px] font-extrabold bg-rose-600 text-white px-1.5 py-0.5 rounded-full">ACTIVE</span>
                      )}
                    </div>
                    <span className="text-slate-600 block mt-1">Gauge 8.6 ft · Inundation</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Assignment Modal */}
      {assigningReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h3 className="font-bold text-sm text-slate-900">Assign Citizen to Evacuation Shelter</h3>
              <button
                onClick={() => setAssigningReport(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="text-xs bg-slate-50 p-3 rounded-lg space-y-1">
              <div className="font-semibold text-slate-800">
                Help Request ({assigningReport.helpCategory}):
              </div>
              <div className="text-slate-600 italic">"{assigningReport.description}"</div>
            </div>

            <form onSubmit={handleAssign} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Target Evacuation Shelter</label>
                <select
                  value={selectedShelterId}
                  onChange={e => setSelectedShelterId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                  required
                >
                  {shelters.map(s => (
                    <option
                      key={s._id}
                      value={s._id}
                      disabled={s.status === 'full' || s.status === 'closed'}
                    >
                      {s.name} ({s.wardName}) - {s.remainingCapacity} spaces left [{s.status}]
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Party / Household Size</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={partySize}
                  onChange={e => setPartySize(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Relief Logistics Notes</label>
                <textarea
                  rows="2"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Elderly citizen requires ground floor bedding; 2 children."
                  className="w-full p-2 border border-slate-300 rounded text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setAssigningReport(null)}
                  className="px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                >
                  {submitting ? 'Allocating…' : 'Confirm Allocation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
