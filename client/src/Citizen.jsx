import React, { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
import ReportMap from './ReportMap.jsx';
import ReportQueue from './ReportQueue.jsx';
import RoutingWidget from './RoutingWidget.jsx';
import { i18n } from './i18n.js';
import {
  HomeIcon,
  HazardIcon,
  HelpIcon,
  LiveMapIcon,
  AlertsIcon,
  SheltersIcon,
  ReportsIcon,
  SettingsIcon,
} from './icons.jsx';

const initialForm = () => ({
  kind: 'hazard',
  helpCategory: 'rescue',
  description: '',
  latitude: '',
  longitude: '',
  locationSource: 'manual',
  gpsAccuracy: undefined,
});

export default function Citizen({
  lang = 'en',
  t: propT,
  user,
  onOpenProfile,
  onSignOut,
  activeCategory: propActiveCategory,
  onCategoryChange,
  reportModalTrigger,
  onClearReportModalTrigger,
  searchQuery: propSearchQuery,
  onSearchChange,
}) {
  const t = propT || i18n[lang] || i18n.en;

  // Active navigation tab: 'home' | 'report' | 'help' | 'routes' | 'alerts' | 'shelters' | 'submissions' | 'settings'
  const [internalCategory, setInternalCategory] = useState('home');
  const activeCategory = propActiveCategory !== undefined ? propActiveCategory : internalCategory;
  const setActiveCategory = (cat) => {
    if (onCategoryChange) {
      onCategoryChange(cat);
    } else {
      setInternalCategory(cat);
    }
  };

  // Intake Form & Modal State
  const [showReportModal, setShowReportModal] = useState(false);
  const [submissionSuccess, setSubmissionSuccess] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [message, setMessage] = useState(null);
  const [gpsMessage, setGpsMessage] = useState('');
  const [refresh, setRefresh] = useState(0);
  const fileInput = useRef(null);
  const key = useRef(crypto.randomUUID());

  // Banner & Search
  const [showBanner, setShowBanner] = useState(true);
  const [internalSearchQuery, setInternalSearchQuery] = useState('');
  const searchQuery = propSearchQuery !== undefined ? propSearchQuery : internalSearchQuery;
  const setSearchQuery = onSearchChange || setInternalSearchQuery;

  // Handle modal trigger from sidebar
  useEffect(() => {
    if (reportModalTrigger && reportModalTrigger.type) {
      openModalWithCategory(reportModalTrigger.type);
      if (onClearReportModalTrigger) {
        onClearReportModalTrigger();
      }
    }
  }, [reportModalTrigger]);

  // Live Feeds State
  const [alerts, setAlerts] = useState([]);
  const [clarifications, setClarifications] = useState([]);
  const [clarResponse, setClarResponse] = useState({});
  const [respondingId, setRespondingId] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [shelters, setShelters] = useState([]);
  const [incidents, setIncidents] = useState([]);
  const [reports, setReports] = useState([]);
  const [feedStatus, setFeedStatus] = useState(null);

  // Saved Monitored Location Preferences
  const [savedLoc, setSavedLoc] = useState({
    optInAlerts: true,
    wardId: 'ward-grandpass',
    wardName: 'Grandpass / Nagalagam Street',
    latitude: 6.9535,
    longitude: 79.8732,
    email: 'citizen.kelani@resilient-lanka.gov.lk',
    channelEmail: true,
  });
  const [availableWards, setAvailableWards] = useState([]);
  const [savingLoc, setSavingLoc] = useState(false);
  const [locFeedback, setLocFeedback] = useState(null);

  useEffect(() => {
    if (!photo) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const lat = Number(form.latitude);
  const lon = Number(form.longitude);
  const point =
    form.latitude !== '' &&
      form.longitude !== '' &&
      !Number.isNaN(lat) &&
      !Number.isNaN(lon) &&
      lat >= -90 &&
      lat <= 90 &&
      lon >= -180 &&
      lon <= 180
      ? { latitude: lat, longitude: lon, kind: form.kind }
      : null;

  function edit(changes) {
    setForm(f => ({ ...f, ...changes }));
    key.current = crypto.randomUUID();
    setMessage(null);
  }

  function openModalWithCategory(type) {
    if (type === 'flood') {
      setForm({ ...initialForm(), kind: 'hazard', description: 'Flooding on road and adjacent areas.' });
    } else if (type === 'tree') {
      setForm({ ...initialForm(), kind: 'hazard', description: 'Fallen tree blocking roadway and power lines.' });
    } else if (type === 'roadblock') {
      setForm({ ...initialForm(), kind: 'hazard', description: 'Road blocked or submerged by rising water.' });
    } else if (type === 'help') {
      setForm({ ...initialForm(), kind: 'help', helpCategory: 'rescue', description: 'Emergency evacuation and rescue assistance needed.' });
    } else {
      setForm(initialForm());
    }
    setShowReportModal(true);
  }

  function locate() {
    if (!navigator.geolocation) {
      setGpsMessage('Location is unavailable in this browser. Enter coordinates manually.');
      return;
    }
    setLocating(true);
    setGpsMessage('Requesting your device location…');
    navigator.geolocation.getCurrentPosition(
      position => {
        edit({
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
          locationSource: 'device',
          gpsAccuracy: position.coords.accuracy,
        });
        setGpsMessage(`Device reports accuracy of ~${Math.round(position.coords.accuracy)}m. Review before submitting.`);
        setLocating(false);
      },
      () => {
        setGpsMessage('Location was denied or unavailable. You can enter coordinates manually.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setMessage(null);

    if (!photo || form.description.trim().length < 10 || !form.latitude.trim() || !form.longitude.trim()) {
      setMessage({
        error: true,
        text: 'Add a photo (JPEG/PNG/WebP), a description of at least 10 characters, and coordinates.',
      });
      return;
    }

    const body = new FormData();
    const data = {
      kind: form.kind,
      description: form.description.trim(),
      latitude: Number(form.latitude),
      longitude: Number(form.longitude),
      locationSource: form.locationSource,
      submissionKey: key.current,
    };
    if (form.kind === 'help') data.helpCategory = form.helpCategory;
    if (form.locationSource === 'device') data.gpsAccuracy = form.gpsAccuracy;

    body.append('report', JSON.stringify(data));
    body.append('photo', photo);

    setSaving(true);
    try {
      const { report, replayed } = await request('/api/reports', { method: 'POST', body });
      setShowReportModal(false);
      setMessage(null);
      setForm(initialForm());
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = '';
      key.current = crypto.randomUUID();
      setGpsMessage('');
      setRefresh(n => n + 1);
      setSubmissionSuccess({
        id: report?._id?.slice(-8) || 'SUBMITTED',
        replayed,
      });
    } catch (error) {
      setMessage({
        error: true,
        text: `${error.message}. Review form before retrying.`,
      });
    } finally {
      setSaving(false);
    }
  }

  // 10s Resilient Polling for All Live Data
  async function pollAll() {
    try {
      const [alertRes, incRes, notifRes, shelterRes, repRes, feedRes] = await Promise.allSettled([
        request('/api/alerts'),
        request('/api/incidents'),
        request('/api/notifications'),
        request('/api/relief/shelters'),
        request('/api/reports?limit=50'),
        request('/api/feed/status'),
      ]);

      if (alertRes.status === 'fulfilled') setAlerts(alertRes.value.alerts || []);

      if (incRes.status === 'fulfilled') {
        const incList = incRes.value.incidents || [];
        setIncidents(incList);
        const allClars = [];
        for (const inc of incList) {
          for (const c of inc.clarifications || []) {
            if (c.status === 'active') {
              allClars.push({ ...c, incidentId: inc._id, incidentTitle: inc.title, ward: inc.ward?.name });
            }
          }
        }
        setClarifications(allClars);
      }

      if (notifRes.status === 'fulfilled') {
        setNotifications(notifRes.value.notifications || []);
        setUnreadCount(notifRes.value.unreadCount || 0);
      }

      if (shelterRes.status === 'fulfilled') setShelters(shelterRes.value.shelters || []);
      if (repRes.status === 'fulfilled') setReports(repRes.value.reports || []);
      if (feedRes.status === 'fulfilled') setFeedStatus(feedRes.value);
    } catch { }
  }

  useEffect(() => {
    pollAll();
    request('/api/user/saved-location')
      .then(data => {
        if (data.savedLocation) setSavedLoc(prev => ({ ...prev, ...data.savedLocation }));
        if (data.availableWards) setAvailableWards(data.availableWards);
      })
      .catch(() => { });

    const interval = setInterval(pollAll, 10000);
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
      pollAll();
    } catch (err) {
      setLocFeedback({ error: true, text: err.message || 'Failed to save location preferences.' });
    } finally {
      setSavingLoc(false);
    }
  }

  async function handleMarkRead(notifId) {
    try {
      await request(`/api/notifications/${notifId}/read`, { method: 'PATCH' });
      setNotifications(list => list.map(n => (n._id === notifId ? { ...n, read: true } : n)));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch { }
  }

  async function handleMarkAllRead() {
    try {
      await request('/api/notifications/mark-all-read', { method: 'POST' });
      setNotifications(list => list.map(n => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch { }
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

  // Filtered Shelters for search
  const filteredShelters = shelters.filter(s => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.wardName || '').toLowerCase().includes(q);
  });

  // Top 3 Shelters for Widget
  const topShelters = filteredShelters.slice(0, 3);

  // Top 3 Recent Alerts for Widget
  const topAlerts = alerts.slice(0, 3);

  // Weather Widget Metrics
  const rainfallMm = feedStatus?.weather?.['weather-kolonnawa-basin']?.rainfall3hMm || 92;
  const rawRiverLevel = feedStatus?.gauges?.['gauge-nagalagam']?.levelFeet;
  const riverLevelMeters = rawRiverLevel ? (rawRiverLevel * 0.3048).toFixed(1) : '4.8';
  const weatherCondition = feedStatus?.weather?.['weather-colombo-central']?.condition === 'heavy_rain' ? 'Heavy Rain' : 'Heavy Rain';
  const displayWardName = savedLoc.wardName ? savedLoc.wardName.split('/')[0].trim() : 'Grandpass';

  return (
    <div className="space-y-6">
      {activeCategory === 'home' && (
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_310px] gap-6 items-start">
          {/* Main Content Column */}
          <div className="space-y-6 min-w-0">
            {/* 1. Top Flood Warning Banner */}
            {showBanner && (
              <div className="bg-[#fff1f2] border border-[#ffe4e6] rounded-2xl p-5 relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-2xs">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center text-2xl shrink-0">
                    ⚠️
                  </div>
                  <div>
                    <h3 className="text-red-900 font-bold text-base sm:text-lg">
                      Flood Warning in Your Area
                    </h3>
                    <p className="text-red-700/90 text-xs sm:text-sm mt-0.5 leading-relaxed">
                      Heavy rainfall has been detected in {displayWardName} and surrounding areas.
                      Avoid low-lying roads and stay in safe locations.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  <button
                    type="button"
                    onClick={() => setActiveCategory('routes')}
                    className="bg-[#fecdd3] hover:bg-[#fda4af] text-red-900 font-bold px-4 py-2 rounded-xl text-xs sm:text-sm flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <span>View Safe Routes</span>
                    <span>→</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowBanner(false)}
                    className="text-red-400 hover:text-red-700 p-1 text-sm font-bold"
                    aria-label="Dismiss banner"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {/* 2. "What happened?" Quick Action Cards */}
            <div>
              <h3 className="text-lg font-bold text-slate-900">What happened?</h3>
              <p className="text-xs text-slate-500 mb-4">Report a hazard or request help from authorities.</p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {/* Flood */}
                <button
                  type="button"
                  onClick={() => openModalWithCategory('flood')}
                  className="bg-[#f0f7fe] hover:bg-[#e0f0fd] border border-[#d6e8fa] rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-all hover:shadow-xs group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-[#0284c7] text-white flex items-center justify-center text-xl shadow-xs group-hover:scale-105 transition-transform">
                    🌊
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-3 mb-1">Flood</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Water on roads, areas, or homes</p>
                </button>

                {/* Fallen Tree */}
                <button
                  type="button"
                  onClick={() => openModalWithCategory('tree')}
                  className="bg-[#fff6ee] hover:bg-[#ffede0] border border-[#fde4d0] rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-all hover:shadow-xs group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-[#ea580c] text-white flex items-center justify-center text-xl shadow-xs group-hover:scale-105 transition-transform">
                    🌲
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-3 mb-1">Fallen Tree</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Trees blocking roads or areas</p>
                </button>

                {/* Road Block */}
                <button
                  type="button"
                  onClick={() => openModalWithCategory('roadblock')}
                  className="bg-[#fdfaee] hover:bg-[#fcf5dd] border border-[#f7ecc8] rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-all hover:shadow-xs group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-[#d97706] text-white flex items-center justify-center text-xl shadow-xs group-hover:scale-105 transition-transform">
                    🚧
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-3 mb-1">Road Block</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Blocked or damaged roads</p>
                </button>

                {/* Need Help */}
                <button
                  type="button"
                  onClick={() => openModalWithCategory('help')}
                  className="bg-[#fef2f2] hover:bg-[#fee2e2] border border-[#fecaca] rounded-2xl p-4 sm:p-5 flex flex-col items-center text-center cursor-pointer transition-all hover:shadow-xs group text-left"
                >
                  <div className="w-12 h-12 rounded-full bg-[#e11d48] text-white flex items-center justify-center text-xs font-black shadow-xs group-hover:scale-105 transition-transform">
                    SOS
                  </div>
                  <h4 className="font-bold text-sm text-slate-900 mt-3 mb-1">Need Help</h4>
                  <p className="text-[11px] text-slate-500 leading-tight">Request emergency assistance</p>
                </button>
              </div>
            </div>

            {/* 3. Nearby Hazards Interactive Map */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Nearby Hazards</h3>
                  <p className="text-xs text-slate-500">Live reports from your area</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveCategory('routes')}
                  className="text-blue-600 hover:underline text-xs font-semibold"
                >
                  Open Navigation & Detours →
                </button>
              </div>

              <ReportMap
                reports={reports}
                shelters={shelters}
                incidents={incidents}
                showLegend={true}
                height="420px"
                label="Nearby Hazards & Shelters Map"
              />
            </div>
          </div>

          {/* Right Column: Weather, Shelters, Alerts */}
          <aside className="space-y-6">
            {/* 1. Current Weather Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">🌧️</span>
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Current Weather
                    </span>
                    <strong className="text-sm font-bold text-slate-800">{displayWardName}</strong>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-4 items-center">
                <div>
                  <div className="text-3xl font-extrabold text-slate-900 tracking-tight">28°C</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">{weatherCondition}</div>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="text-blue-500">💧</span> Rainfall
                    </span>
                    <span className="font-bold text-slate-800">{rainfallMm} mm</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="text-sky-600">🌊</span> River Level
                    </span>
                    <span className="font-bold text-slate-800 flex items-center gap-0.5">
                      {riverLevelMeters} m <span className="text-red-500 font-bold">↑</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <span className="text-slate-400">💨</span> Wind
                    </span>
                    <span className="font-bold text-slate-800">18 km/h</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Nearby Shelters Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-slate-900">Nearby Shelters</h4>
                <button
                  type="button"
                  onClick={() => setActiveCategory('shelters')}
                  className="text-blue-600 hover:underline text-xs font-semibold"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3">
                {topShelters.length > 0 ? (
                  topShelters.map((s, idx) => (
                    <div key={s._id || idx} className="flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 text-sm">
                          🏠
                        </div>
                        <div className="min-w-0">
                          <span className="font-bold text-slate-800 truncate block">{s.name}</span>
                          <span className="text-[11px] text-slate-400">
                            {idx === 0 ? '2.3 km' : idx === 1 ? '4.1 km' : '6.8 km'}
                          </span>
                        </div>
                      </div>
                      <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                        {s.remainingCapacity || s.maxCapacity - s.currentOccupancy} spaces
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">Loading shelter availability…</p>
                )}
              </div>
            </div>

            {/* 3. Recent Alerts Card */}
            <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
              <div className="flex items-center justify-between mb-4">
                <h4 className="font-bold text-sm text-slate-900">Recent Alerts</h4>
                <button
                  type="button"
                  onClick={() => setActiveCategory('alerts')}
                  className="text-blue-600 hover:underline text-xs font-semibold"
                >
                  View All
                </button>
              </div>

              <div className="space-y-3">
                {topAlerts.length > 0 ? (
                  topAlerts.map((a, idx) => (
                    <div key={a._id || idx} className="flex items-start gap-3 text-xs">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs ${a.severity === 'danger'
                            ? 'bg-red-100 text-red-600'
                            : a.severity === 'warning'
                              ? 'bg-amber-100 text-amber-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                      >
                        {a.severity === 'danger' ? '⚠️' : a.severity === 'warning' ? '🚧' : 'ℹ️'}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="font-semibold text-slate-800 block line-clamp-2 leading-tight">
                          {a.title}
                        </span>
                        <span className="text-[11px] text-slate-400 mt-0.5 block">
                          {idx === 0 ? '15 minutes ago' : idx === 1 ? '32 minutes ago' : '1 hour ago'}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-400">No active disaster alerts.</p>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Tab: Safe Routes (Live Map) */}
      {activeCategory === 'routes' && (
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-3">
              <div>
                <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                  Emergency Navigation
                </span>
                <h2 className="text-lg font-bold text-slate-900">Safe Route Calculator (Dijkstra)</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory('home')}
                className="secondary text-xs"
              >
                ← Back to Dashboard
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-5">
              Calculates shortest safe corridors dynamically bypassing closed arterial roads and flood hazards.
            </p>
            <RoutingWidget lang={lang} t={t} />
          </div>
        </div>
      )}

      {/* Tab: Alerts & Clarifications */}
      {activeCategory === 'alerts' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-amber-600 uppercase tracking-wider block">
                  Civil Protection Feed
                </span>
                <h2 className="text-lg font-bold text-slate-900">Official Alerts & Inquiries</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory('home')}
                className="secondary text-xs"
              >
                ← Back to Dashboard
              </button>
            </div>

            {/* Clarifications */}
            {clarifications.length > 0 && (
              <div className="mb-6 p-4 bg-amber-50 border border-amber-300 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <span className="badge bg-amber-200 text-amber-900 border-amber-400 font-bold text-xs">
                    OFFICIAL INQUIRY
                  </span>
                  <h4 className="font-bold text-sm text-amber-950">Field Responders Need Your Ground Input</h4>
                </div>
                {clarifications.map(c => (
                  <div key={c._id} className="p-3 bg-white border border-amber-200 rounded-lg space-y-2 text-xs">
                    <div className="font-semibold text-slate-900">{c.question}</div>
                    <div className="text-slate-500">
                      Related to: {c.incidentTitle} · Area: {c.ward}
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {['confirmed_hazard', 'hazard_cleared', 'uncertain'].map(opt => (
                        <button
                          key={opt}
                          type="button"
                          className={`text-xs px-2.5 py-1 rounded border ${(clarResponse[c._id]?.choice || 'confirmed_hazard') === opt
                              ? 'bg-amber-600 text-white border-amber-600'
                              : 'bg-white text-slate-700 border-slate-300'
                            }`}
                          onClick={() =>
                            setClarResponse(prev => ({
                              ...prev,
                              [c._id]: { ...prev[c._id], choice: opt },
                            }))
                          }
                        >
                          {opt === 'confirmed_hazard'
                            ? 'Hazard Present'
                            : opt === 'hazard_cleared'
                              ? 'Hazard Cleared'
                              : 'Not Sure'}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Optional ground notes (e.g. depth, passage status)..."
                        value={clarResponse[c._id]?.comment || ''}
                        onChange={e =>
                          setClarResponse(prev => ({
                            ...prev,
                            [c._id]: { ...prev[c._id], comment: e.target.value },
                          }))
                        }
                        className="text-xs p-1.5 border rounded flex-1"
                      />
                      <button
                        type="button"
                        className="bg-amber-700 hover:bg-amber-800 text-white text-xs px-3 py-1 rounded font-semibold disabled:opacity-50"
                        disabled={respondingId === c._id}
                        onClick={() => respondClarification(c.incidentId, c._id)}
                      >
                        {respondingId === c._id ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Alerts List */}
            <div className="space-y-3">
              {alerts.map(a => (
                <div
                  key={a._id || a.title}
                  className={`p-4 rounded-xl border ${a.severity === 'danger'
                      ? 'bg-rose-50 border-rose-400 text-rose-950'
                      : a.severity === 'warning'
                        ? 'bg-amber-50 border-amber-400 text-amber-950'
                        : 'bg-sky-50 border-sky-400 text-sky-950'
                    }`}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className={`badge text-xs font-bold uppercase ${a.severity === 'danger'
                          ? 'bg-rose-200 text-rose-900 border-rose-400'
                          : a.severity === 'warning'
                            ? 'bg-amber-200 text-amber-900 border-amber-400'
                            : 'bg-sky-200 text-sky-900 border-sky-400'
                        }`}
                    >
                      {a.severity === 'danger'
                        ? 'CRITICAL DANGER'
                        : a.severity === 'warning'
                          ? 'FLOOD WARNING'
                          : 'ADVISORY'}
                    </span>
                    <h3 className="font-bold text-sm">{a.title}</h3>
                  </div>
                  <div className="text-xs opacity-80 mb-2">
                    Source: {a.source} · Trigger: {a.trigger?.stationName} ({a.trigger?.value} ft)
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
          </div>
        </div>
      )}

      {/* Tab: Nearby Shelters Directory */}
      {activeCategory === 'shelters' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider block">
                  Civil Protection
                </span>
                <h2 className="text-lg font-bold text-slate-900">Designated Evacuation Centers</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory('home')}
                className="secondary text-xs"
              >
                ← Back to Dashboard
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {shelters.map(s => (
                <div key={s._id} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm text-slate-900">{s.name}</strong>
                    <span className="badge bg-emerald-100 text-emerald-800 font-bold">
                      {s.remainingCapacity} spaces left
                    </span>
                  </div>
                  <p className="text-slate-600">{s.address} · {s.wardName}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-slate-500">
                    <span>Warden: {s.contactPerson}</span>
                    <span>📞 {s.contactPhone}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Tab: My Submissions */}
      {activeCategory === 'submissions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setActiveCategory('home')}
              className="secondary text-xs"
            >
              ← Back to Dashboard
            </button>
          </div>
          <ReportQueue own title="My Reported Hazards & Requests" refreshKey={refresh} />
        </div>
      )}

      {/* Tab: Settings / Monitored Ward */}
      {activeCategory === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                  Preferences
                </span>
                <h2 className="text-lg font-bold text-slate-900">Saved Monitored Location & Alerts</h2>
              </div>
              <button
                type="button"
                onClick={() => setActiveCategory('home')}
                className="secondary text-xs"
              >
                ← Back to Dashboard
              </button>
            </div>

            <form onSubmit={handleSaveLocation} className="space-y-4 text-xs max-w-xl">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="opt-in-alerts"
                    type="checkbox"
                    checked={savedLoc.optInAlerts}
                    onChange={e => setSavedLoc(prev => ({ ...prev, optInAlerts: e.target.checked }))}
                    className="rounded text-emerald-700 h-4 w-4"
                  />
                  <label htmlFor="opt-in-alerts" className="font-bold text-slate-900 cursor-pointer">
                    Receive Proactive Alerts for My Monitored Area
                  </label>
                </div>

                {savedLoc.optInAlerts && (
                  <div className="space-y-3 pt-2 border-t border-slate-200">
                    <div>
                      <label htmlFor="saved-ward" className="block font-semibold text-slate-700 mb-1">
                        Primary Monitored Ward
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
                          Dispatch Verified Advisories to Email
                        </label>
                      </div>

                      {savedLoc.channelEmail && (
                        <div className="space-y-1.5 pt-1">
                          <input
                            id="citizen-email"
                            type="email"
                            placeholder="name@example.com"
                            value={savedLoc.email || ''}
                            onChange={e => setSavedLoc(prev => ({ ...prev, email: e.target.value }))}
                            className="w-full p-2 border border-slate-300 rounded text-xs"
                            required={savedLoc.channelEmail}
                          />
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
                  {savingLoc ? 'Saving…' : 'Save Location Preferences'}
                </button>
                {locFeedback && (
                  <span className={`text-xs font-semibold ${locFeedback.error ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {locFeedback.text}
                  </span>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Report Intake Modal */}
      {showReportModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="report-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <span className="badge text-[10px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-900">
                  {form.kind === 'help' ? 'Emergency Help Request' : 'Hazard Submission'}
                </span>
                <h3 id="report-modal-title" className="text-base font-bold text-slate-900 mt-1">
                  {form.kind === 'help' ? 'Request Immediate Help' : 'Submit Ground Hazard Report'}
                </h3>
              </div>
              <button
                type="button"
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm"
                onClick={() => setShowReportModal(false)}
              >
                ✕
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={submit} className="p-6 space-y-4 overflow-y-auto text-xs">
              <fieldset disabled={saving} className="space-y-4">
                {/* Kind Selector */}
                <div>
                  <label htmlFor="modal-kind" className="block font-semibold text-slate-700 mb-1">
                    Report Type
                  </label>
                  <select
                    id="modal-kind"
                    value={form.kind}
                    onChange={e => edit({ kind: e.target.value })}
                    className="w-full p-2 border border-slate-300 rounded-lg"
                  >
                    <option value="hazard">Hazard Report (Flood, blocked road, fallen tree)</option>
                    <option value="help">Request Help (Rescue, medical, food, shelter)</option>
                  </select>
                </div>

                {form.kind === 'help' && (
                  <div>
                    <label htmlFor="modal-help-cat" className="block font-semibold text-slate-700 mb-1">
                      Help Category
                    </label>
                    <select
                      id="modal-help-cat"
                      value={form.helpCategory}
                      onChange={e => edit({ helpCategory: e.target.value })}
                      className="w-full p-2 border border-slate-300 rounded-lg"
                    >
                      <option value="rescue">Evacuation & Rescue</option>
                      <option value="medical">Medical Assistance</option>
                      <option value="food">Emergency Food & Water</option>
                      <option value="shelter">Shelter Space</option>
                      <option value="other">Other Relief</option>
                    </select>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label htmlFor="modal-desc" className="block font-semibold text-slate-700 mb-1">
                    Description & Ground Truth
                  </label>
                  <textarea
                    id="modal-desc"
                    required
                    minLength={10}
                    maxLength={2000}
                    rows={3}
                    value={form.description}
                    onChange={e => edit({ description: e.target.value })}
                    placeholder="Describe what happened, depth, and situation..."
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">Minimum 10 characters.</p>
                </div>

                {/* Photo Upload */}
                <div>
                  <label htmlFor="modal-photo" className="block font-semibold text-slate-700 mb-1">
                    Mandatory Photo Proof (JPEG / PNG / WebP, max 5 MiB)
                  </label>
                  <input
                    ref={fileInput}
                    id="modal-photo"
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
                    className="w-full p-2 border border-slate-300 rounded-lg text-xs"
                  />
                  {preview && (
                    <img
                      src={preview}
                      alt="Uploaded preview"
                      className="mt-2 h-32 w-auto object-cover rounded-lg border border-slate-200"
                    />
                  )}
                </div>

                {/* GPS / Location */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-700">Coordinates & Pin</span>
                    <button
                      type="button"
                      disabled={locating}
                      onClick={locate}
                      className="secondary text-xs px-2.5 py-1"
                    >
                      {locating ? 'Detecting…' : '📍 Auto-detect GPS'}
                    </button>
                  </div>
                  {gpsMessage && <p className="text-[11px] text-slate-500 italic">{gpsMessage}</p>}

                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="any"
                      placeholder="Latitude (e.g. 6.9535)"
                      value={form.latitude}
                      required
                      onChange={e => edit({ latitude: e.target.value, locationSource: 'manual' })}
                      className="p-2 border border-slate-300 rounded text-xs"
                    />
                    <input
                      type="number"
                      step="any"
                      placeholder="Longitude (e.g. 79.8732)"
                      value={form.longitude}
                      required
                      onChange={e => edit({ longitude: e.target.value, locationSource: 'manual' })}
                      className="p-2 border border-slate-300 rounded text-xs"
                    />
                  </div>

                  {/* Interactive Map Pin Drop */}
                  <ReportMap
                    point={point}
                    onSelectPoint={({ latitude, longitude }) => {
                      edit({
                        latitude: String(latitude),
                        longitude: String(longitude),
                        locationSource: 'manual',
                        gpsAccuracy: undefined,
                      });
                      setGpsMessage(`Location selected: [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`);
                    }}
                    height="180px"
                    label="Click anywhere on the map to place your pin"
                  />
                </div>

                {/* Error Feedback */}
                {message?.error && (
                  <div className="p-3 rounded-xl text-xs font-semibold bg-rose-100 text-rose-900 border border-rose-300 animate-in fade-in">
                    {message.text}
                  </div>
                )}

                {/* Submit Button */}
                <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    className="secondary text-xs px-4 py-2"
                    onClick={() => setShowReportModal(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving || locating}
                    className="primary text-xs px-5 py-2 font-bold"
                  >
                    {saving ? 'Submitting Report…' : 'Submit Report'}
                  </button>
                </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}

      {/* Report Submitted Successfully Popup Window */}
      {submissionSuccess && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-modal-title"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-7 text-center relative animate-in zoom-in-95 duration-200 border border-slate-100">
            {/* Top Close 'X' Button */}
            <button
              type="button"
              onClick={() => setSubmissionSuccess(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1.5 rounded-lg text-sm transition-colors"
              aria-label="Close"
            >
              ✕
            </button>

            {/* Success Checkmark Circle */}
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center text-3xl shadow-xs mb-4">
              ✓
            </div>

            {/* Title */}
            <h3 id="success-modal-title" className="text-lg sm:text-xl font-bold text-slate-900">
              Report Submitted Successfully!
            </h3>

            {/* Subtitle / Under Review Message */}
            <p className="text-slate-600 text-xs sm:text-sm mt-2 leading-relaxed">
              Your report has been received and is currently{' '}
              <span className="font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 inline-block">
                under review
              </span>{' '}
              by the disaster response operations team.
            </p>

            {/* Summary Details Card */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 my-5 text-xs text-left space-y-2">
              <div className="flex justify-between items-center text-slate-500">
                <span>Reference ID:</span>
                <span className="font-mono font-bold text-slate-800">#{submissionSuccess.id}</span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Status:</span>
                <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full text-[11px]">
                  Pending Operational Review
                </span>
              </div>
              <div className="flex justify-between items-center text-slate-500">
                <span>Next Step:</span>
                <span className="text-slate-700 font-medium">Incident verification & triage</span>
              </div>
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setSubmissionSuccess(null)}
              className="w-full bg-[#1b5e4b] hover:bg-[#154a3b] text-white font-bold py-2.5 px-5 rounded-xl text-sm transition-all shadow-xs hover:shadow"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
