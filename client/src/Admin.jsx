import { useState, useEffect } from 'react';
import { request } from './api.js';
import ReportQueue from './ReportQueue.jsx';

export default function Admin({ lang = 'en', t = {} }) {
  const [activeTab, setActiveTab] = useState('config'); // 'config' | 'feedback' | 'audit'
  const [configData, setConfigData] = useState(null);
  const [feedbackData, setFeedbackData] = useState(null);
  const [auditData, setAuditData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState(null);

  // Deploy config form state
  const [editParams, setEditParams] = useState({
    alertMmH: 30,
    alertRiverFeet: 5.0,
    minorFloodRiverFeet: 7.0,
    majorFloodRiverFeet: 8.0,
    clusterRadiusMeters: 200,
    clusterWindowHours: 4,
    aiModel: 'gemini-3.8-flash',
    aiPromptInstructions: '',
  });
  const [changeSummary, setChangeSummary] = useState('');
  const [deploying, setDeploying] = useState(false);

  async function loadAll() {
    try {
      const [cfg, fb, aud] = await Promise.all([
        request('/api/admin/config'),
        request('/api/admin/feedback'),
        request('/api/admin/audit-logs'),
      ]);
      setConfigData(cfg);
      setFeedbackData(fb);
      setAuditData(aud);

      if (cfg.activeConfig) {
        const p = cfg.activeConfig.parameters || {};
        const wt = p.weatherThresholds || {};
        setEditParams({
          alertMmH: wt.alertMmH || 30,
          alertRiverFeet: wt.alertRiverFeet || 5.0,
          minorFloodRiverFeet: wt.minorFloodRiverFeet || 7.0,
          majorFloodRiverFeet: wt.majorFloodRiverFeet || 8.0,
          clusterRadiusMeters: p.clusterRadiusMeters || 200,
          clusterWindowHours: p.clusterWindowHours || 4,
          aiModel: p.aiModel || 'gemini-3.8-flash',
          aiPromptInstructions: p.aiPromptInstructions || '',
        });
      }
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function handleDeployConfig(e) {
    e.preventDefault();
    if (!changeSummary.trim()) {
      setActionMessage({ error: true, text: 'Change summary is required to deploy a new version.' });
      return;
    }
    setDeploying(true);
    setActionMessage(null);
    try {
      const res = await request('/api/admin/config', {
        method: 'POST',
        body: JSON.stringify({
          parameters: {
            weatherThresholds: {
              alertMmH: Number(editParams.alertMmH),
              alertRiverFeet: Number(editParams.alertRiverFeet),
              minorFloodRiverFeet: Number(editParams.minorFloodRiverFeet),
              majorFloodRiverFeet: Number(editParams.majorFloodRiverFeet),
            },
            clusterRadiusMeters: Number(editParams.clusterRadiusMeters),
            clusterWindowHours: Number(editParams.clusterWindowHours),
            aiModel: editParams.aiModel,
            aiPromptInstructions: editParams.aiPromptInstructions,
          },
          changeSummary: changeSummary.trim(),
        }),
      });
      setActionMessage({ success: true, text: `Successfully deployed Configuration Version ${res.config.version}.` });
      setChangeSummary('');
      await loadAll();
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    } finally {
      setDeploying(false);
    }
  }

  async function handleRollback(targetVersion) {
    if (!confirm(`Roll back configuration to Version ${targetVersion}? This will deploy a new version restoring its settings.`)) return;
    setActionMessage(null);
    try {
      const res = await request(`/api/admin/config/${targetVersion}/rollback`, { method: 'POST' });
      setActionMessage({ success: true, text: `Successfully rolled back to Version ${targetVersion}. Created Version ${res.config.version}.` });
      await loadAll();
    } catch (err) {
      setActionMessage({ error: true, text: err.message });
    }
  }

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Loading Administrator Governance Panel…</div>;
  }

  const activeCfg = configData?.activeConfig;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-slate-900 text-white rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="badge bg-purple-400 text-slate-950 font-bold text-xs">
                {lang === 'si' ? 'පරිපාලනය' : 'ADMINISTRATION'}
              </span>
              <h2 className="text-xl font-bold text-white">
                {lang === 'si' ? 'පද්ධති පාලනය සහ ප්‍රතිපත්ති කළමනාකරණය' : 'System Governance & Policy Management'}
              </h2>
            </div>
            <p className="text-xs text-slate-300">
              {lang === 'si'
                ? 'විගණනය කළ පද්ධති පාලනය, අනුවාද කළ සැකසුම් සහ මානව ප්‍රතිචාර සමාලෝචනය.'
                : 'Audited system controls, immutable versioned configuration, and human review feedback.'}
            </p>
          </div>
          {activeCfg && (
            <div className="bg-slate-800 border border-slate-700 px-4 py-2 rounded-lg text-xs">
              <span className="text-slate-400 block text-[11px]">
                {lang === 'si' ? 'ක්‍රියාකාරී අනුවාදය' : 'Active Configuration'}
              </span>
              <strong className="text-purple-300 font-mono text-sm">
                {lang === 'si' ? `අනුවාදය ${activeCfg.version}` : `Version ${activeCfg.version}`}
              </strong>
              <span className="text-slate-400 block text-[11px]">
                {new Date(activeCfg.deployedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>

        {/* Tab Navigation */}
        <div className="flex border-t border-slate-800 pt-3 gap-2">
          {[
            { id: 'config', label: lang === 'si' ? 'අනුවාදිත සැකසුම්' : 'Versioned Configuration' },
            { id: 'feedback', label: lang === 'si' ? 'මානව සහ AI ප්‍රතිචාර' : 'Human Review & AI Feedback' },
            { id: 'audit', label: lang === 'si' ? 'පද්ධති විගණන ලඝු' : 'System Audit Logs' },
            { id: 'reports', label: lang === 'si' ? 'වාර්තා කළමනාකරණය සහ දත්ත පිරිසිදු කිරීම' : 'Manage Reports & Clean Data' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
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

      {/* TAB 1: Versioned Configuration */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Deploy New Version Form */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <div>
              <h3 className="font-bold text-base text-slate-800">Deploy New Configuration Version</h3>
              <p className="text-xs text-slate-500">
                Adjust hydrological threshold rules, spatial clustering limits, or Gemini system prompt guidelines.
              </p>
            </div>

            <form onSubmit={handleDeployConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rainfall Alert Rate (mm/h)</label>
                  <input
                    type="number"
                    value={editParams.alertMmH}
                    onChange={e => setEditParams(p => ({ ...p, alertMmH: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">River Alert Level (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editParams.alertRiverFeet}
                    onChange={e => setEditParams(p => ({ ...p, alertRiverFeet: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Minor Flood Gauge (ft)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={editParams.minorFloodRiverFeet}
                    onChange={e => setEditParams(p => ({ ...p, minorFloodRiverFeet: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded text-xs"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cluster Distance (meters)</label>
                  <input
                    type="number"
                    value={editParams.clusterRadiusMeters}
                    onChange={e => setEditParams(p => ({ ...p, clusterRadiusMeters: e.target.value }))}
                    className="w-full p-2 border border-slate-300 rounded text-xs"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Active AI Model</label>
                <input
                  type="text"
                  value={editParams.aiModel}
                  onChange={e => setEditParams(p => ({ ...p, aiModel: e.target.value }))}
                  className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">AI Prompt Operational Guidelines</label>
                <textarea
                  rows="3"
                  value={editParams.aiPromptInstructions}
                  onChange={e => setEditParams(p => ({ ...p, aiPromptInstructions: e.target.value }))}
                  className="w-full p-2 border border-slate-300 rounded text-xs font-mono"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Audit Change Summary</label>
                <input
                  type="text"
                  placeholder="e.g. Updated river alert thresholds in response to heavy monsoonal inflows"
                  value={changeSummary}
                  onChange={e => setChangeSummary(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded text-xs"
                  required
                  minLength={5}
                />
              </div>

              <div className="p-3 bg-purple-50 border border-purple-200 rounded text-purple-900 text-[11px] leading-relaxed">
                <strong>Governance Rule:</strong> Deploying creates an immutable version increment. This modifies prompt instructions and deterministic thresholds; models are <em>never retrained online</em>.
              </div>

              <button
                type="submit"
                disabled={deploying}
                className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg text-xs shadow-xs"
              >
                {deploying ? 'Deploying Version…' : 'Deploy Configuration Version →'}
              </button>
            </form>
          </section>

          {/* Version History Changelog */}
          <section className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <h3 className="font-bold text-base text-slate-800">Version History & Rollbacks</h3>
            <div className="space-y-3 overflow-y-auto max-h-[500px]">
              {configData?.versions?.map(v => (
                <div
                  key={v.version}
                  className={`p-3.5 rounded-lg border text-xs space-y-2 ${
                    v.isActive
                      ? 'bg-purple-50/70 border-purple-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <strong className="font-mono text-sm text-slate-900">
                        Version {v.version}
                      </strong>
                      {v.isActive && (
                        <span className="badge bg-purple-200 text-purple-900 border-purple-400 font-bold text-[10px]">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      {new Date(v.deployedAt).toLocaleDateString()} {new Date(v.deployedAt).toLocaleTimeString()}
                    </span>
                  </div>

                  <p className="text-slate-700 font-medium">{v.changeSummary}</p>

                  <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 font-mono">
                    <span>Rain Alert: {v.parameters?.weatherThresholds?.alertMmH} mm/h</span>
                    <span>River Alert: {v.parameters?.weatherThresholds?.alertRiverFeet} ft</span>
                    <span>Cluster Radius: {v.parameters?.clusterRadiusMeters} m</span>
                    <span>Model: {v.parameters?.aiModel}</span>
                  </div>

                  {!v.isActive && (
                    <div className="pt-1 flex justify-end">
                      <button
                        onClick={() => handleRollback(v.version)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded text-[11px] font-semibold"
                      >
                        Roll Back to V{v.version}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* TAB 2: Human Feedback & AI Governance */}
      {activeTab === 'feedback' && (
        <div className="space-y-6">
          {/* Analytics Header */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
              <span className="text-slate-400 text-xs block">Reviews Recorded</span>
              <strong className="text-xl text-slate-900">{feedbackData?.analytics?.total || 0}</strong>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
              <span className="text-slate-400 text-xs block">Human Confirmed</span>
              <strong className="text-xl text-emerald-600">
                {feedbackData?.analytics?.byVerdict?.confirmed || 0}
              </strong>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
              <span className="text-slate-400 text-xs block">Needs Verification</span>
              <strong className="text-xl text-amber-600">
                {feedbackData?.analytics?.byVerdict?.needs_verification || 0}
              </strong>
            </div>
            <div className="bg-white border border-slate-200 p-3.5 rounded-xl shadow-xs">
              <span className="text-slate-400 text-xs block">Human Rejected</span>
              <strong className="text-xl text-rose-600">
                {feedbackData?.analytics?.byVerdict?.rejected || 0}
              </strong>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg text-amber-900 text-xs">
            <strong>Policy Notice:</strong> {feedbackData?.disclaimer}
          </div>

          {/* Feedback Items Stream */}
          <div className="space-y-3">
            <h3 className="font-bold text-base text-slate-800">Recent Human Review Log</h3>
            {(!feedbackData?.feedback || feedbackData.feedback.length === 0) ? (
              <div className="p-8 bg-white border border-slate-200 rounded-xl text-center text-slate-500 text-xs">
                No human evaluation reviews recorded yet. Operations officers record feedback when reviewing report cases.
              </div>
            ) : (
              feedbackData.feedback.map(fb => (
                <div key={fb._id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-2 shadow-xs text-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`badge text-[11px] font-bold ${
                        fb.humanVerdict === 'confirmed' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                        fb.humanVerdict === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                        'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        VERDICT: {fb.humanVerdict?.toUpperCase()}
                      </span>
                      <span className="text-slate-500">
                        AI Verdict: <strong>{fb.aiVerdict}</strong>
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        Config V{fb.configVersion}
                      </span>
                    </div>
                    <span className="text-slate-400 text-[11px]">
                      By {fb.submittedBy?.username || 'Staff'} · {new Date(fb.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <p className="text-slate-700 italic">"{fb.notes || 'No comments provided.'}"</p>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {fb.tags?.map(t => (
                      <span key={t} className="px-2 py-0.5 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[11px] font-mono">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 3: System Audit Logs & Moderation */}
      {activeTab === 'audit' && (
        <div className="space-y-6">
          {/* Restricted Users Notice */}
          {auditData?.restrictedUsers?.length > 0 && (
            <div className="p-4 bg-rose-50 border border-rose-300 rounded-xl space-y-2 text-xs">
              <h4 className="font-bold text-rose-900">Restricted Citizen Accounts ({auditData.restrictedUsers.length})</h4>
              <div className="space-y-1">
                {auditData.restrictedUsers.map(u => (
                  <div key={u.username} className="flex justify-between text-rose-800">
                    <span><strong>{u.username}</strong> ({u.role})</span>
                    <span>Reason: {u.restrictionReason || 'Administrative restriction'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audit Event Stream */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-xs">
            <h3 className="font-bold text-base text-slate-800">Unified System Audit Trail</h3>
            <div className="space-y-2.5 overflow-y-auto max-h-[600px] text-xs">
              {auditData?.logs?.map((evt, i) => (
                <div key={i} className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={`badge text-[10px] font-bold ${
                        evt.type === 'config_event' ? 'bg-purple-100 text-purple-800 border-purple-300' :
                        evt.type === 'incident_event' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                        'bg-amber-100 text-amber-800 border-amber-300'
                      }`}>
                        {evt.action?.toUpperCase()}
                      </span>
                      <strong className="text-slate-900">{evt.title}</strong>
                    </div>
                    <div className="text-slate-500 text-[11px]">
                      {JSON.stringify(evt.details)}
                    </div>
                  </div>
                  <div className="text-right text-[11px] text-slate-400 shrink-0">
                    {new Date(evt.timestamp).toLocaleTimeString()} · {new Date(evt.timestamp).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Reports & Evidence Clean-up */}
      {activeTab === 'reports' && (
        <div className="space-y-4">
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between gap-4">
            <div>
              <h3 className="font-bold text-sm text-purple-950">Administrative Report Management</h3>
              <p className="text-xs text-purple-800">
                Inspect live citizen reports and permanently remove completed or test submissions. Deleting a report automatically cleans up associated photos from GridFS binary storage.
              </p>
            </div>
            <span className="badge bg-purple-200 text-purple-900 font-mono text-xs shrink-0">
              Admin Role Required
            </span>
          </div>
          <ReportQueue title={lang === 'si' ? "සියලු ආපදා සහ උපකාර වාර්තා" : "All Incident & Hazard Reports"} user={{ role: 'admin' }} lang={lang} t={t} />
        </div>
      )}
    </div>
  );
}
