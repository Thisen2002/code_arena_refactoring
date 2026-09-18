import { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import ReportMap from './ReportMap.jsx';
import ReportQueue from './ReportQueue.jsx';
import RoutingWidget from './RoutingWidget.jsx';
import { i18n } from './i18n.js';

const initial = () => ({ kind: 'hazard', helpCategory: 'rescue', description: '', latitude: '', longitude: '', locationSource: 'manual', gpsAccuracy: undefined });
export default function Citizen({ lang = 'en', t: propT }) {
  const t = propT || i18n[lang] || i18n.en;
  const [form, setForm] = useState(initial);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState(null);
  const [gpsMessage, setGpsMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const fileInput = useRef(null);
  const key = useRef(crypto.randomUUID());
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const lat = Number(form.latitude);
  const lon = Number(form.longitude);
  const point = form.latitude !== '' && form.longitude !== '' && !Number.isNaN(lat) && !Number.isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 ? { latitude: lat, longitude: lon, kind: form.kind } : null;

  function edit(changes) { setForm(f => ({ ...f, ...changes })); key.current = crypto.randomUUID(); setMessage(null); }
  function locate() {
    if (!navigator.geolocation) { setGpsMessage('Location is unavailable in this browser. Enter coordinates manually.'); return; }
    setLocating(true); setGpsMessage('Requesting your device location…');
    navigator.geolocation.getCurrentPosition(position => {
      edit({ latitude: String(position.coords.latitude), longitude: String(position.coords.longitude), locationSource: 'device', gpsAccuracy: position.coords.accuracy });
      setGpsMessage(`Device reports accuracy of approximately ${Math.round(position.coords.accuracy)} metres. Review the location before submitting.`); setLocating(false);
    }, () => { setGpsMessage('Location was denied or unavailable. You can enter coordinates manually; no location has been guessed.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 });
  }
  async function submit(event) {
    event.preventDefault(); if (saving) return;
    setMessage(null);
    if (!photo || form.description.trim().length < 10 || !form.latitude.trim() || !form.longitude.trim()) { setMessage({ error: true, text: 'Add a photo, a description of at least 10 characters, and both coordinates.' }); return; }
    const body = new FormData();
    const data = { kind: form.kind, description: form.description.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), locationSource: form.locationSource, submissionKey: key.current };
    if (form.kind === 'help') data.helpCategory = form.helpCategory;
    if (form.locationSource === 'device') data.gpsAccuracy = form.gpsAccuracy;
    body.append('report', JSON.stringify(data)); body.append('photo', photo);
    setSaving(true);
    try {
      const { report, replayed } = await request('/api/reports', { method: 'POST', body });
      setMessage({ text: `${replayed ? 'Already saved' : 'Saved to MongoDB'}. Report ID: ${report._id}. Your photo is stored; assessment and dispatch have not happened.` });
      setForm(initial()); setPhoto(null); fileInput.current.value = ''; key.current = crypto.randomUUID(); setGpsMessage(''); setRefresh(n => n + 1);
    } catch (error) { setMessage({ error: true, text: `${error.message} Check your reports before changing the form. Retrying unchanged uses the same submission key.` }); }
    finally { setSaving(false); }
  }
  const [clarifications, setClarifications] = useState([]);
  const [clarResponse, setClarResponse] = useState({});
  const [respondingId, setRespondingId] = useState(null);

  // Live Alerts, Feed Health & In-App Notifications State
  const [alerts, setAlerts] = useState([]);
  const [alertFeedStatus, setAlertFeedStatus] = useState('loading'); // 'loading' | 'ready' | 'unavailable'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Saved Monitored Location Preferences
  const [savedLoc, setSavedLoc] = useState({
    optInAlerts: false,
    wardId: 'ward-grandpass',
    wardName: 'Grandpass / Nagalagam Street',
    latitude: 6.9535,
    longitude: 79.8732,
    email: '',
    channelEmail: false,
  });
  const [availableWards, setAvailableWards] = useState([]);
  const [savingLoc, setSavingLoc] = useState(false);
  const [locFeedback, setLocFeedback] = useState(null);

  // 10s Resilient Short Polling for Live Signals
  async function pollLiveFeeds() {
    // 1. Incidents & Clarifications
    try {
      const incData = await request('/api/incidents');
      const allClars = [];
      for (const inc of (incData.incidents || [])) {
        for (const c of (inc.clarifications || [])) {
          if (c.status === 'active') {
            allClars.push({ ...c, incidentId: inc._id, incidentTitle: inc.title, ward: inc.ward?.name });
          }
        }
      }
      setClarifications(allClars);
    } catch {
      // Retain last known state on transient error
    }

    // 2. River Gauge Alerts (with explicit error tracking)
    try {
      const alertData = await request('/api/alerts');
      setAlerts(alertData.alerts || []);
      setAlertFeedStatus('ready');
    } catch {
      setAlertFeedStatus('unavailable');
    }

    // 3. Citizen In-App Notifications
    try {
      const notifData = await request('/api/notifications');
      setNotifications(notifData.notifications || []);
      setUnreadCount(notifData.unreadCount || 0);
    } catch {
      // In-app notifications
    }
  }

  useEffect(() => {
    pollLiveFeeds();

    // Load initial saved location preferences
    request('/api/user/saved-location')
      .then(data => {
        if (data.savedLocation) {
          setSavedLoc(prev => ({ ...prev, ...data.savedLocation }));
        }
        if (data.availableWards) {
          setAvailableWards(data.availableWards);
        }
      })
      .catch(() => {});

    const interval = setInterval(pollLiveFeeds, 10000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function handleSaveLocation(e) {
    e.preventDefault();
    setSavingLoc(true);
    setLocFeedback(null);
    try {
      const res = await request('/api/user/saved-location', {
        method: 'PUT',
        body: JSON.stringify(savedLoc),
      });
      if (res.savedLocation) setSavedLoc(res.savedLocation);
      setLocFeedback({ success: true, text: res.message || 'Preferences saved.' });
      pollLiveFeeds();
    } catch (err) {
      setLocFeedback({ error: true, text: err.message || 'Failed to save location preferences.' });
    } finally {
      setSavingLoc(false);
    }
  }

  async function handleMarkRead(notifId) {
    try {
      await request(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
      setNotifications(list => list.map(n => n._id === notifId ? { ...n, read: true } : n));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {}
  }

  async function handleMarkAllRead() {
    try {
      await request('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications(list => list.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  }

  async function respondClarification(incidentId, clarId) {
    const choice = clarResponse[clarId]?.choice || 'confirmed_hazard';
    const comment = clarResponse[clarId]?.comment || '';
    setRespondingId(clarId);
    try {
      await request(`/api/incidents/${incidentId}/clarification/${clarId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ responseChoice: choice, comment }),
      });
      setClarifications(clars => clars.filter(c => c._id !== clarId));
      setMessage({ text: 'Thank you. Your confirmation has been submitted to emergency responders.' });
    } catch (err) {
      setMessage({ error: true, text: err.message || 'Failed to submit response.' });
    } finally {
      setRespondingId(null);
    }
  }

  const [activeCategory, setActiveCategory] = useState('report');
  const urgentCount = alerts.length + clarifications.length + unreadCount;

  return (
    <div className="space-y-6">
      {/* High-priority Emergency Alert Bar if warnings, inquiries or unread nearby alerts exist */}
      {urgentCount > 0 && activeCategory !== 'alerts' && activeCategory !== 'notifications' && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => setActiveCategory(unreadCount > 0 ? 'notifications' : 'alerts')}
          onKeyDown={e => e.key === 'Enter' && setActiveCategory(unreadCount > 0 ? 'notifications' : 'alerts')}
          className="cursor-pointer p-4 rounded-xl border flex flex-wrap items-center justify-between gap-3 shadow-xs hover:shadow-md transition-all duration-150 bg-rose-50 border-rose-300 text-rose-950"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-600"></span>
            </span>
            <div>
              <span className="font-extrabold text-xs uppercase tracking-wider text-rose-900 block">
                {unreadCount > 0 ? `${unreadCount} Unread Nearby Alert${unreadCount > 1 ? 's' : ''} for Your Saved Location` : ''}
                {unreadCount > 0 && (alerts.length > 0 || clarifications.length > 0) ? ' · ' : ''}
                {alerts.length > 0 ? `${alerts.length} Active Hydrological Warning${alerts.length > 1 ? 's' : ''}` : ''}
                {alerts.length > 0 && clarifications.length > 0 ? ' · ' : ''}
                {clarifications.length > 0 ? `${clarifications.length} Responder Inquiry Requiring Input` : ''}
              </span>
              <span className="text-xs text-rose-800">
                {unreadCount > 0
                  ? notifications.find(n => !n.read)?.title || 'Urgent hazard updates near your monitored area.'
                  : alerts[0]?.title || clarifications[0]?.question || 'Official emergency updates require your attention.'}
              </span>
            </div>
          </div>
          <span className="text-xs font-bold text-rose-900 bg-white px-3 py-1.5 rounded-lg border border-rose-200 shadow-2xs hover:bg-rose-100 transition-colors">
            {unreadCount > 0 ? 'View Nearby Alerts →' : 'View Alerts & Respond →'}
          </span>
        </div>
      )}

      {/* Category Navigation Tabs */}
      <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-2xs">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Citizen categories">
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'report'}
            onClick={() => setActiveCategory('report')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'report'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>📢</span>
            <span>{t.tabReport}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'routes'}
            onClick={() => setActiveCategory('routes')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'routes'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🧭</span>
            <span>{t.tabRoutes}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'submissions'}
            onClick={() => setActiveCategory('submissions')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
              activeCategory === 'submissions'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>📋</span>
            <span>{t.tabSubmissions}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'alerts'}
            onClick={() => setActiveCategory('alerts')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
              activeCategory === 'alerts'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>⚠️</span>
            <span>{t.tabAlerts}</span>
            {(alerts.length > 0 || clarifications.length > 0) && (
              <span className="bg-amber-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                {alerts.length + clarifications.length}
              </span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeCategory === 'notifications'}
            onClick={() => setActiveCategory('notifications')}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all relative ${
              activeCategory === 'notifications'
                ? 'bg-[#174b3c] text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span>🔔</span>
            <span>{t.tabMyArea}</span>
            {unreadCount > 0 && (
              <span className="bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 1: Submit Report / Request Help */}
      {activeCategory === 'report' && (
        <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
          <section className="panel">
            <div className="eyebrow">{t.reportingEyebrow}</div>
            <h2>{t.formHeading}</h2>
            <p className="muted mb-5">{t.formMuted}</p>

            <form onSubmit={submit} className="space-y-5">
              <fieldset disabled={saving} className="space-y-5">
                <div>
                  <label htmlFor="kind">{t.descriptionLabel ? (lang === 'si' ? 'ඉදිරිපත් කිරීමේ වර්ගය' : 'I want to') : 'I want to'}</label>
                  <select id="kind" value={form.kind} onChange={e => edit({ kind: e.target.value })}>
                    <option value="hazard">{t.hazardType}</option>
                    <option value="help">{t.helpType}</option>
                  </select>
                </div>
                {form.kind === 'help' && (
                  <div>
                    <label htmlFor="help-category">{lang === 'si' ? 'අවශ්‍ය ආධාර වර්ගය' : 'Help needed'}</label>
                    <select id="help-category" value={form.helpCategory} onChange={e => edit({ helpCategory: e.target.value })}>
                      <option value="rescue">{t.helpCategoryRescue}</option>
                      <option value="medical">{t.helpCategoryMedical}</option>
                      <option value="food">{t.helpCategoryFood}</option>
                      <option value="shelter">{t.helpCategoryShelter}</option>
                      <option value="other">{lang === 'si' ? 'වෙනත් ආධාර' : 'Other'}</option>
                    </select>
                  </div>
                )}
                <div>
                  <label htmlFor="description">Description</label>
                  <textarea
                    id="description"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={4}
                    value={form.description}
                    onChange={e => edit({ description: e.target.value })}
                    placeholder="What happened, where, and when?"
                    aria-describedby="description-help"
                  />
                  <p id="description-help" className="muted text-xs mt-2">10–2,000 characters. Avoid personal details that are not needed.</p>
                </div>
                <div>
                  <label htmlFor="photo">Photo evidence</label>
                  <input
                    ref={fileInput}
                    id="photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    required
                    onChange={e => {
                      const file = e.target.files[0];
                      if (file && file.size > 5 * 1024 * 1024) {
                        setMessage({ error: true, text: 'Choose a photo no larger than 5 MiB.' });
                        e.target.value = '';
                        setPhoto(null);
                        return;
                      }
                      setPhoto(file || null);
                      key.current = crypto.randomUUID();
                      setMessage(null);
                    }}
                  />
                  <p className="muted text-xs mt-2">JPEG, PNG or WebP · up to 5 MiB / 20 megapixels. Original metadata is retained as private evidence. Avoid identifiable bystanders where possible.</p>
                  {preview && <img className="photo-preview mt-3" src={preview} alt="Preview of your selected evidence" />}
                </div>
                <button className="secondary" type="button" disabled={locating} onClick={locate}>
                  {locating ? (lang === 'si' ? 'ස්ථානය ලබාගනිමින් පවතී…' : 'Getting location…') : t.detectLocation}
                </button>
                {gpsMessage && <p role="status" className="muted text-sm">{gpsMessage}</p>}
                <div className="grid gap-4 sm:grid-cols-2">
                  {['latitude', 'longitude'].map(name => (
                    <div key={name}>
                      <label className="capitalize" htmlFor={name}>{lang === 'si' ? (name === 'latitude' ? 'අක්ෂාංශය (Latitude)' : 'දේශාංශය (Longitude)') : name}</label>
                      <input
                        id={name}
                        type="number"
                        step="any"
                        required
                        min={name === 'latitude' ? -90 : -180}
                        max={name === 'latitude' ? 90 : 180}
                        value={form[name]}
                        onChange={e => {
                          edit({ [name]: e.target.value, locationSource: 'manual', gpsAccuracy: undefined });
                          setGpsMessage(lang === 'si' ? 'ඇතුළත් කළ ඛණ්ඩාංක තහවුරු නොකළ ඒවා වේ.' : 'Manually entered coordinates are unverified.');
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-slate-700">{lang === 'si' ? 'සිතියම මත ස්ථානය ලකුණු කරන්න' : 'Map Pin Location'}</span>
                    <span className="text-[11px] text-slate-500">{lang === 'si' ? 'ඛණ්ඩාංක තෝරාගැනීමට සිතියම මත ක්ලික් කරන්න' : 'Click anywhere on the map to set coordinates'}</span>
                  </div>
                  <ReportMap
                    point={point}
                    onSelectPoint={({ latitude, longitude }) => {
                      edit({ latitude: String(latitude), longitude: String(longitude), locationSource: 'manual', gpsAccuracy: undefined });
                      setGpsMessage(`Location selected via map pin [${latitude.toFixed(4)}, ${longitude.toFixed(4)}] · manual unverified pin.`);
                    }}
                    label="Interactive Location Picker"
                  />
                </div>
                <p className="muted text-xs">GPS is device-supplied, not proof of the photo’s location. Missing photo GPS remains unknown. Reporting is supported throughout Sri Lanka; no operational coverage is implied.</p>
                <button className="primary" disabled={saving || locating}>
                  {saving ? t.submitting : t.submitReport}
                </button>
              </fieldset>
              {message && (
                <div className={`p-4 rounded-xl text-xs font-semibold ${message.error ? 'bg-rose-100 text-rose-900 border border-rose-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`} role={message.error ? 'alert' : 'status'}>
                  <p>{message.text}</p>
                  {!message.error && (
                    <button
                      type="button"
                      onClick={() => setActiveCategory('submissions')}
                      className="mt-2 text-xs font-bold text-emerald-950 underline hover:no-underline block"
                    >
                      Track this in My Submissions →
                    </button>
                  )}
                </div>
              )}
            </form>
          </section>

          <aside className="space-y-5">
            <section className="panel dark">
              <div className="eyebrow">STAGE 01–06 · HUMAN RESPONSE CHAIN</div>
              <h3>Verified reports. Dispatched crews.</h3>
              <p>Reports are clustered into incidents, evaluated by AI & sensor rules, and dispatched to field crews who close hazards with photos.</p>
            </section>
            <section className="panel">
              <span className="badge bg-emerald-100 text-emerald-800">OPERATIONAL CLOSURE</span>
              <h3>Safe hazard clearance</h3>
              <p className="muted">When crews upload photo proof of road clearance, hazard warnings clear and public routes re-open automatically.</p>
            </section>
          </aside>
        </div>
      )}

      {/* Tab 2: Safe Evacuation Routes */}
      {activeCategory === 'routes' && (
        <div className="space-y-4">
          <div className="panel bg-white">
            <div className="eyebrow">{lang === 'si' ? 'හදිසි ආපදා සංචාලනය' : 'EMERGENCY NAVIGATION'}</div>
            <h2>{t.routingTitle}</h2>
            <p className="muted text-sm mb-4">
              {t.routingDesc}
            </p>
            <RoutingWidget lang={lang} t={t} />
          </div>
        </div>
      )}

      {/* Tab 3: My Submissions & Status */}
      {activeCategory === 'submissions' && (
        <div>
          <ReportQueue own title="My reports and help requests" refreshKey={refresh} />
        </div>
      )}

      {/* Tab 4: Live Alerts & Official Inquiries */}
      {activeCategory === 'alerts' && (
        <div className="space-y-6">
          <section className="panel">
            <div className="eyebrow">{t.alertsEyebrow}</div>
            <h2>{t.alertsHeading}</h2>
            <p className="muted text-sm mb-4">
              {t.alertsSubheading}
            </p>

            {alertFeedStatus === 'unavailable' ? (
              <div className="p-6 bg-amber-50 border border-amber-300 rounded-xl space-y-2">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                  <span>⚠️</span>
                  <h4>{lang === 'si' ? 'සංවේදක දත්ත විසන්ධි වී ඇත' : 'Live Sensor Telemetry Feed Offline'}</h4>
                </div>
                <p className="text-xs text-amber-800">
                  {lang === 'si' ? 'ස්වයංක්‍රීය ගංගා ජල මට්ටම් සහ වර්ෂාපතන දත්ත තාවකාලිකව ලබාගත නොහැක.' : 'Automated river gauge and rainfall station telemetry is temporarily unavailable. Do not assume corridors are clear. Responders are continuing manual field monitoring.'}
                </p>
              </div>
            ) : alerts.length === 0 && clarifications.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-2xl">🛡️</span>
                <h4 className="font-bold text-slate-800 text-sm">{t.allClearTitle}</h4>
                <p className="muted text-xs">{t.allClearDesc}</p>
              </div>
            ) : (
              <>
                {alerts.length > 0 && (
                  <div className="mb-6 space-y-3">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">{lang === 'si' ? 'ක්‍රියාකාරී ගංවතුර අනතුරු ඇඟවීම්' : 'Hydrological Warnings'} ({alerts.length})</h3>
                    {alerts.map(a => (
                      <div
                        key={a._id || a.title}
                        className={`p-4 rounded-xl border ${
                          a.severity === 'danger'
                            ? 'bg-rose-50 border-rose-400 text-rose-950'
                            : a.severity === 'warning'
                            ? 'bg-amber-50 border-amber-400 text-amber-950'
                            : 'bg-sky-50 border-sky-400 text-sky-950'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`badge text-xs font-bold uppercase ${
                              a.severity === 'danger'
                                ? 'bg-rose-200 text-rose-900 border-rose-400'
                                : a.severity === 'warning'
                                ? 'bg-amber-200 text-amber-900 border-amber-400'
                                : 'bg-sky-200 text-sky-900 border-sky-400'
                            }`}
                          >
                            {a.severity === 'danger' ? (lang === 'si' ? 'අධි අවදානම්' : 'CRITICAL DANGER') : a.severity === 'warning' ? (lang === 'si' ? 'ගංවතුර අනතුරු ඇඟවීම' : 'FLOOD WARNING') : (lang === 'si' ? 'විශේෂ නිවේදනය' : 'ADVISORY')}
                          </span>
                          <h3 className="font-bold text-sm">{a.title}</h3>
                        </div>
                        <div className="text-xs opacity-80 mb-2">
                          {lang === 'si' ? 'මූලාශ්‍රය' : 'Source'}: {a.source} · {lang === 'si' ? 'මිනුම් ස්ථානය' : 'Trigger'}: {a.trigger?.stationName} ({a.trigger?.value} ft)
                        </div>
                        {a.recommendations?.length > 0 && (
                          <ul className="list-disc list-inside text-xs space-y-0.5">
                            {a.recommendations.map((rec, i) => (
                              <li key={i}>{rec}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {clarifications.length > 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="badge bg-amber-200 text-amber-900 border-amber-400 font-bold text-xs">{lang === 'si' ? 'නිල විමසීමක්' : 'OFFICIAL INQUIRY'}</span>
                      <h3 className="font-bold text-sm text-amber-950">{t.officialInquiryTitle}</h3>
                    </div>
                    {clarifications.map(c => (
                      <div key={c._id} className="p-3 bg-white border border-amber-200 rounded-lg space-y-2 text-xs">
                        <div className="font-semibold text-slate-900">{c.question}</div>
                        <div className="text-slate-500">{lang === 'si' ? 'අදාළ සිද්ධිය' : 'Related to'} {c.incidentTitle} · {lang === 'si' ? 'ප්‍රදේශය' : 'Area'}: {c.ward}</div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          {['confirmed_hazard', 'hazard_cleared', 'uncertain'].map(opt => (
                            <button
                              key={opt}
                              type="button"
                              className={`text-xs px-2.5 py-1 rounded border ${
                                (clarResponse[c._id]?.choice || 'confirmed_hazard') === opt
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white text-slate-700 border-slate-300'
                              }`}
                              onClick={() => setClarResponse(prev => ({ ...prev, [c._id]: { ...prev[c._id], choice: opt } }))}
                            >
                              {opt === 'confirmed_hazard' ? t.hazardPresentBtn : opt === 'hazard_cleared' ? t.hazardClearedBtn : t.notSureBtn}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <input
                            type="text"
                            placeholder={lang === 'si' ? 'අමතර තොරතුරු (උදා: ජල මට්ටම, ගමනාගමන තත්ත්වය)...' : 'Optional details (e.g., depth, passage status)...'}
                            value={clarResponse[c._id]?.comment || ''}
                            onChange={e => setClarResponse(prev => ({ ...prev, [c._id]: { ...prev[c._id], comment: e.target.value } }))}
                            className="text-xs p-1.5 border rounded flex-1"
                          />
                          <button
                            type="button"
                            className="bg-amber-700 hover:bg-amber-800 text-white text-xs px-3 py-1 rounded font-semibold disabled:opacity-50"
                            disabled={respondingId === c._id}
                            onClick={() => respondClarification(c.incidentId, c._id)}
                          >
                            {respondingId === c._id ? (lang === 'si' ? 'යවමින්…' : 'Sending…') : (lang === 'si' ? 'යවන්න' : 'Send')}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {/* Tab 5: Nearby Warnings & Saved Location Delivery */}
      {activeCategory === 'notifications' && (
        <div className="space-y-6">
          {/* Section 1: Saved Monitored Location Preferences */}
          <section className="panel bg-white border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div>
                <div className="eyebrow">{t.notifEyebrow}</div>
                <h2>{t.notifHeading}</h2>
              </div>
              <span className="badge bg-emerald-100 text-emerald-800 font-bold text-xs">
                {savedLoc.optInAlerts ? (lang === 'si' ? '● සක්‍රීයයි' : '● ALERTS ACTIVE') : (lang === 'si' ? '○ අක්‍රීයයි' : '○ ALERTS OFF')}
              </span>
            </div>
            <p className="muted text-xs mb-4">
              {t.notifSubheading}
            </p>

            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="opt-in-alerts"
                    type="checkbox"
                    checked={savedLoc.optInAlerts}
                    onChange={e => setSavedLoc(prev => ({ ...prev, optInAlerts: e.target.checked }))}
                    className="rounded text-emerald-700 h-4 w-4"
                  />
                  <label htmlFor="opt-in-alerts" className="font-bold text-slate-900 cursor-pointer">
                    {t.optInCheckbox}
                  </label>
                </div>

                {savedLoc.optInAlerts && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label htmlFor="saved-ward" className="block font-semibold text-slate-700 mb-1">
                        {t.primaryWardLabel}
                      </label>
                      <select
                        id="saved-ward"
                        value={savedLoc.wardId || ''}
                        onChange={e => {
                          const wId = e.target.value;
                          const found = availableWards.find(w => w.id === wId);
                          setSavedLoc(prev => ({
                            ...prev,
                            wardId: wId,
                            wardName: found ? found.name : prev.wardName,
                            latitude: found?.center?.latitude ?? prev.latitude,
                            longitude: found?.center?.longitude ?? prev.longitude,
                          }));
                        }}
                        className="w-full p-2 border border-slate-300 rounded bg-white text-xs"
                      >
                        {availableWards.map(w => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.district})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          id="channel-email-toggle"
                          type="checkbox"
                          checked={Boolean(savedLoc.channelEmail)}
                          onChange={e => setSavedLoc(prev => ({ ...prev, channelEmail: e.target.checked }))}
                          className="rounded text-blue-600 h-4 w-4"
                        />
                        <label htmlFor="channel-email-toggle" className="font-semibold text-slate-900 cursor-pointer">
                          {t.emailChannelToggle}
                        </label>
                      </div>

                      {savedLoc.channelEmail && (
                        <div className="space-y-1.5 pt-1">
                          <label htmlFor="citizen-email" className="block text-[11px] text-slate-600 font-medium">
                            {lang === 'si' ? 'විද්‍යුත් තැපැල් ලිපිනය (Email):' : 'Recipient Email Address:'}
                          </label>
                          <input
                            id="citizen-email"
                            type="email"
                            placeholder="name@example.com"
                            value={savedLoc.email || ''}
                            onChange={e => setSavedLoc(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full p-2 border border-slate-300 rounded text-xs"
                            required={savedLoc.channelEmail}
                          />
                          <p className="text-[10px] text-slate-500 italic">
                            🔒 Strict Privacy: Emails contain only the affected corridor, warning type, timestamp, and a link to live detour routes. Private citizen report descriptions, photos, and exact coordinates are never emailed.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="submit"
                  disabled={savingLoc}
                  className="bg-[#174b3c] hover:bg-[#123b30] text-white text-xs px-4 py-2 rounded-lg font-bold shadow-xs disabled:opacity-50"
                >
                  {savingLoc ? (lang === 'si' ? 'සුරකිමින් පවතී…' : 'Saving Settings…') : t.savePreferencesBtn}
                </button>
                {locFeedback && (
                  <span className={`text-xs font-semibold ${locFeedback.error ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {locFeedback.text}
                  </span>
                )}
              </div>
            </form>
          </section>

          {/* Section 2: In-App Notification Feed */}
          <section className="panel bg-white border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
                  <span>In-App Location Alerts Feed</span>
                  {unreadCount > 0 && (
                    <span className="bg-rose-600 text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                      {unreadCount} Unread
                    </span>
                  )}
                </h3>
                <p className="muted text-xs">
                  Updates triggered automatically when hazards are confirmed, weather warnings issue, or incidents are resolved near {savedLoc.wardName || 'your area'}.
                </p>
              </div>

              {notifications.length > 0 && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="secondary text-xs"
                >
                  ✓ Mark All as Read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <span className="text-2xl">🔔</span>
                <h4 className="font-bold text-slate-800 text-sm">No Location Alerts Yet</h4>
                <p className="muted text-xs max-w-md mx-auto">
                  {savedLoc.optInAlerts
                    ? `Your monitored location is set to ${savedLoc.wardName}. When responders confirm hazards or river gauges trigger in your area, instant advisories will display here.`
                    : 'Opt in above to receive proactive advisories when incidents or weather warnings affect your saved location.'}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {notifications.map(n => (
                  <div
                    key={n._id}
                    className={`p-4 rounded-xl border transition-all ${
                      n.type === 'incident_resolved'
                        ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950'
                        : n.type === 'officer_confirmed_incident'
                        ? 'bg-rose-50/70 border-rose-300 text-rose-950'
                        : 'bg-sky-50/70 border-sky-300 text-sky-950'
                    } ${!n.read ? 'ring-2 ring-emerald-400/50 shadow-xs' : 'opacity-90'}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`badge text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
                            n.type === 'incident_resolved'
                              ? 'bg-emerald-200 text-emerald-900 border-emerald-400'
                              : n.type === 'officer_confirmed_incident'
                              ? 'bg-rose-200 text-rose-900 border-rose-400'
                              : 'bg-sky-200 text-sky-900 border-sky-400'
                          }`}
                        >
                          {n.type === 'incident_resolved'
                            ? '✅ HAZARD RESOLVED'
                            : n.type === 'officer_confirmed_incident'
                            ? '🚨 OFFICER-CONFIRMED INCIDENT'
                            : '🌦️ SIMULATED WEATHER WARNING'}
                        </span>
                        {!n.read && (
                          <span className="bg-emerald-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">
                            NEW
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500">
                          {new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Delivery Status Pill */}
                      <div className="flex items-center gap-2">
                        {n.emailDelivery?.sent ? (
                          <span className="text-[10px] font-semibold bg-white/90 px-2 py-0.5 rounded border border-emerald-300 text-emerald-800" title={`Dispatched to ${n.emailDelivery.recipientEmail}`}>
                            ✉️ Email Delivered
                          </span>
                        ) : n.emailDelivery?.attempted && !n.emailDelivery?.sent ? (
                          <span className="text-[10px] font-semibold bg-white/90 px-2 py-0.5 rounded border border-amber-300 text-amber-800" title={n.emailDelivery.error}>
                            ⚠️ Email Failed (In-App Safe)
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-500 bg-white/80 px-2 py-0.5 rounded border border-slate-200">
                            📱 In-App Alert
                          </span>
                        )}

                        {!n.read && (
                          <button
                            type="button"
                            onClick={() => handleMarkRead(n._id)}
                            className="text-[11px] text-slate-600 hover:text-slate-900 font-semibold underline ml-1"
                          >
                            Mark Read
                          </button>
                        )}
                      </div>
                    </div>

                    <h4 className="font-bold text-sm text-slate-900 mb-1">{n.title}</h4>
                    <p className="text-xs text-slate-700 mb-2.5">{n.message}</p>

                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 text-[11px] text-slate-500">
                      <div>
                        Corridor / Ward: <strong className="text-slate-800">{n.area}</strong> · Source: {n.source}
                      </div>
                      {n.type !== 'incident_resolved' && (
                        <button
                          type="button"
                          onClick={() => setActiveCategory('routes')}
                          className="font-bold text-[#174b3c] hover:underline"
                        >
                          Check Safe Evacuation Detour Routes →
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
