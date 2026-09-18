import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { request } from './api.js';
import AuthPanel from './AuthPanel.jsx';
import Citizen from './Citizen.jsx';
import ReportQueue from './ReportQueue.jsx';
import Crew from './Crew.jsx';
import Relief from './Relief.jsx';
import Admin from './Admin.jsx';
import ProfileModal from './ProfileModal.jsx';
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
  OperationsIcon,
  ReliefIcon,
  CrewIcon,
  AdminIcon,
} from './icons.jsx';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, errorInfo) {
    console.error('UI Render Error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="panel max-w-lg w-full text-center">
            <span className="badge bg-amber-100 text-amber-800 font-semibold">Session Reconnection</span>
            <h2 className="mt-3 text-xl font-bold">Workspace Refreshing</h2>
            <p className="muted text-sm my-3">
              {this.state.error?.message || 'A transient rendering error occurred.'}
            </p>
            <div className="flex justify-center gap-3 mt-4">
              <button
                className="primary"
                onClick={() => {
                  this.setState({ hasError: false, error: null });
                  window.location.reload();
                }}
              >
                Reload Workspace
              </button>
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await fetch('/api/auth/logout', {
                      method: 'POST',
                      headers: { 'X-Requested-With': 'CodeArena' },
                    });
                  } catch {}
                  window.location.hash = '';
                  window.location.reload();
                }}
              >
                Sign Out & Return to Login
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function roleViews(role) {
  if (role === 'citizen') return ['Citizen'];
  if (role === 'officer') return ['Operations', 'Relief'];
  if (role === 'crew') return ['Crew'];
  if (role === 'relief') return ['Relief'];
  if (role === 'admin') return ['Operations', 'Crew', 'Relief', 'Admin'];
  return [];
}

function defaultRoleView(role) {
  if (role === 'officer') return 'Operations';
  if (role === 'relief') return 'Relief';
  if (role === 'crew') return 'Crew';
  if (role === 'admin') return 'Operations';
  return 'Citizen';
}

function resolveView(hash, views, role) {
  const normalized = (hash || '').replace('#', '').trim().toLowerCase();
  const direct = (views || []).find(v => v.toLowerCase() === normalized);
  if (direct) return direct;
  return defaultRoleView(role);
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [health, setHealth] = useState(null);
  const [lang, setLang] = useState(() => localStorage.getItem('rl_lang') || 'en');
  const [activeCitizenTab, setActiveCitizenTab] = useState('home');
  const [reportModalTrigger, setReportModalTrigger] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const t = i18n[lang] || i18n.en;

  function toggleLang(nextLang) {
    setLang(nextLang);
    localStorage.setItem('rl_lang', nextLang);
  }

  useEffect(() => {
    let active = true;
    async function checkHealth() {
      try {
        const h = await request('/api/health');
        if (active) setHealth(h);
      } catch {
        if (active) setHealth({ server: 'unavailable', ready: false });
      }
    }
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const availableViews = user ? roleViews(user.role) : [];
  const [view, setView] = useState(() => resolveView(location.hash, availableViews, user?.role));

  useEffect(() => {
    function onHashChange() {
      if (!user) return;
      const views = roleViews(user.role);
      setView(resolveView(location.hash, views, user.role));
    }
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [user]);

  useEffect(() => {
    let active = true;
    let retryTimer = null;

    async function loadSession() {
      try {
        const data = await request('/api/auth/me');
        if (!active) return;
        const loggedUser = data.user;
        setUser(loggedUser);
        const views = roleViews(loggedUser.role);
        const targetView = resolveView(location.hash, views, loggedUser.role);
        setView(targetView);
        const targetHash = targetView.toLowerCase();
        if ((location.hash || '').replace('#', '').toLowerCase() !== targetHash) {
          location.hash = targetHash;
        }
        setAuthError('');
        setChecking(false);
      } catch (err) {
        if (!active) return;
        if (err.message && (err.message.includes('unavailable') || err.message.includes('connecting'))) {
          setChecking(true);
          retryTimer = setTimeout(loadSession, 3000);
        } else {
          setUser(null);
          setChecking(false);
        }
      }
    }

    loadSession();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  function signedIn(value) {
    setUser(value);
    setAuthError('');
    const target = defaultRoleView(value.role);
    setView(target);
    location.hash = ({
      citizen: 'citizen',
      officer: 'operations',
      admin: 'operations',
      relief: 'relief',
      crew: 'crew',
    })[value.role] || 'citizen';
  }

  async function signOut() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setView('Citizen');
      location.hash = '';
      setAuthError('');
    } catch (e) {
      setAuthError(e.message);
    }
  }

  useEffect(() => {
    if (!user) return;
    request('/api/notifications')
      .then(d => {
        if (d && typeof d.unreadCount === 'number') {
          setUnreadNotifCount(d.unreadCount);
        }
      })
      .catch(() => {});
  }, [user]);

  const displayName = user?.fullName
    ? user.fullName.split(' ')[0]
    : user?.username === 'demo-citizen'
    ? 'Chamika'
    : user?.username || 'User';

  function content() {
    if (checking) return <p role="status" className="py-6 text-slate-500">Checking your session…</p>;
    if (!user) return <AuthPanel onUser={signedIn} />;
    if (view === 'Citizen' && user.role === 'citizen') {
      return (
        <Citizen
          lang={lang}
          t={t}
          user={user}
          activeCategory={activeCitizenTab}
          onCategoryChange={setActiveCitizenTab}
          reportModalTrigger={reportModalTrigger}
          onClearReportModalTrigger={() => setReportModalTrigger(null)}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenProfile={() => setShowProfile(true)}
          onSignOut={signOut}
          onUnreadCountChange={setUnreadNotifCount}
        />
      );
    }
    if (view === 'Operations' && ['officer', 'admin'].includes(user.role)) return <ReportQueue title={t.operationsNav || "Report inbox"} user={user} lang={lang} t={t} />;
    if (view === 'Crew' && ['crew', 'admin'].includes(user.role)) return <Crew lang={lang} t={t} />;
    if (view === 'Relief' && ['relief', 'officer', 'admin'].includes(user.role)) return <Relief lang={lang} t={t} />;
    if (view === 'Admin' && user.role === 'admin') return <Admin lang={lang} t={t} />;
    return (
      <section className="panel">
        <span className="badge">Access restricted</span>
        <h2 className="mt-4">This view requires a different role</h2>
        <p className="muted">You are signed in as {user.role}. The server independently enforces access. Sign out to use another authorized account.</p>
      </section>
    );
  }

  // Unauthenticated screen
  if (!user && !checking) {
    return (
      <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col justify-center items-center p-4">
        <div className="flex items-center gap-3 mb-6">
          <img src="/logo.png" alt="Resilient Lanka" className="h-12 w-auto object-contain drop-shadow-xs" />
          <div>
            <span className="block font-extrabold text-xl tracking-tight text-slate-900 leading-tight">
              {t.platformName || 'Resilient Lanka'}
            </span>
            <span className="block text-xs font-extrabold uppercase tracking-wider text-sky-600 leading-none mt-0.5">
              {t.platformSubtitle || 'DISASTER RESPONSE PLATFORM'}
            </span>
          </div>
        </div>
        <div className="w-full max-w-md">
          {authError && <p role="alert" className="notice error mb-5 text-xs">{authError}</p>}
          <AuthPanel onUser={signedIn} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 flex flex-col md:flex-row">
      <a href="#main" className="skip">Skip to content</a>

      {/* Left Navigation Sidebar - Docked to Dashboard for All Roles */}
      <aside className="w-full md:w-60 bg-white border-b md:border-b-0 md:border-r border-slate-200/80 shrink-0 md:min-h-screen flex flex-col md:sticky md:top-0 md:h-screen overflow-y-auto z-40">
        {/* Brand Logo & Name */}
        <div className="p-4 sm:px-5 sm:py-4 flex items-center gap-3 border-b border-slate-100">
          <img
            src="/logo.png"
            alt="Resilient Lanka Emblem"
            className="h-10 w-auto object-contain drop-shadow-xs"
          />
          <div>
            <span className="block font-extrabold text-base tracking-tight text-slate-900 leading-tight">
              {t.platformName || 'Resilient Lanka'}
            </span>
            <span className="block text-[9px] font-extrabold uppercase tracking-wider text-sky-600 leading-none mt-0.5">
              {t.platformSubtitle || 'DISASTER RESPONSE PLATFORM'}
            </span>
          </div>
        </div>

        {/* Navigation Items with Monochrome Outline Vector Icons */}
        <nav className="p-3 space-y-1 flex-1">
          {/* Citizen Navigation Items */}
          {user?.role === 'citizen' && (
            <>
              {/* Home */}
              <button
                type="button"
                onClick={() => {
                  setActiveCitizenTab('home');
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeCitizenTab === 'home' && view === 'Citizen'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <HomeIcon className={`w-5 h-5 shrink-0 ${activeCitizenTab === 'home' && view === 'Citizen' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.navHome || 'Home'}</span>
              </button>

              {/* Report Hazard */}
              <button
                type="button"
                onClick={() => {
                  setReportModalTrigger({ type: 'hazard', ts: Date.now() });
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-slate-950 transition-all"
              >
                <HazardIcon className="w-5 h-5 text-slate-800 shrink-0" />
                <span>{t.navReportHazard || 'Report Hazard'}</span>
              </button>

              {/* Request Help */}
              <button
                type="button"
                onClick={() => {
                  setReportModalTrigger({ type: 'help', ts: Date.now() });
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-slate-950 transition-all"
              >
                <HelpIcon className="w-5 h-5 text-slate-800 shrink-0" />
                <span>{t.navRequestHelp || 'Request Help'}</span>
              </button>

              {/* Live Map */}
              <button
                type="button"
                onClick={() => {
                  setActiveCitizenTab('routes');
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeCitizenTab === 'routes' && view === 'Citizen'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <LiveMapIcon className={`w-5 h-5 shrink-0 ${activeCitizenTab === 'routes' && view === 'Citizen' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.navLiveMap || 'Live Map'}</span>
              </button>

              {/* Alerts */}
              <button
                type="button"
                onClick={() => {
                  setActiveCitizenTab('alerts');
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeCitizenTab === 'alerts' && view === 'Citizen'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <AlertsIcon className={`w-5 h-5 shrink-0 ${activeCitizenTab === 'alerts' && view === 'Citizen' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                  <span>{t.navAlerts || 'Alerts'}</span>
                </div>
                {unreadNotifCount > 0 && (
                  <span className="bg-[#e11d48] text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                    {unreadNotifCount}
                  </span>
                )}
              </button>

              {/* Nearby Shelters */}
              <button
                type="button"
                onClick={() => {
                  setActiveCitizenTab('shelters');
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeCitizenTab === 'shelters' && view === 'Citizen'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <SheltersIcon className={`w-5 h-5 shrink-0 ${activeCitizenTab === 'shelters' && view === 'Citizen' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.navNearbyShelters || 'Nearby Shelters'}</span>
              </button>

              {/* My Reports */}
              <button
                type="button"
                onClick={() => {
                  setActiveCitizenTab('submissions');
                  if (view !== 'Citizen') location.hash = 'citizen';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeCitizenTab === 'submissions' && view === 'Citizen'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <ReportsIcon className={`w-5 h-5 shrink-0 ${activeCitizenTab === 'submissions' && view === 'Citizen' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.navMyReports || 'My Reports'}</span>
              </button>
            </>
          )}

          {/* Officer Navigation Items (Operations [landing] & Relief only - no crew!) */}
          {user?.role === 'officer' && (
            <>
              {/* Operations (Landing Page) */}
              <button
                type="button"
                onClick={() => {
                  setView('Operations');
                  location.hash = 'operations';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Operations'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <OperationsIcon className={`w-5 h-5 shrink-0 ${view === 'Operations' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.operationsNav || 'Operations'}</span>
              </button>

              {/* Relief */}
              <button
                type="button"
                onClick={() => {
                  setView('Relief');
                  location.hash = 'relief';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Relief'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <ReliefIcon className={`w-5 h-5 shrink-0 ${view === 'Relief' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.reliefNav || 'Relief'}</span>
              </button>
            </>
          )}

          {/* Crew Navigation Items */}
          {user?.role === 'crew' && (
            <button
              type="button"
              onClick={() => {
                setView('Crew');
                location.hash = 'crew';
              }}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                view === 'Crew'
                  ? 'bg-[#eef4ff] text-[#2563eb]'
                  : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              <CrewIcon className={`w-5 h-5 shrink-0 ${view === 'Crew' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
              <span>{t.navWorkOrders || 'Work Orders'}</span>
            </button>
          )}

          {/* Relief Role Navigation Items */}
          {user?.role === 'relief' && (
            <button
              type="button"
              onClick={() => {
                setView('Relief');
                location.hash = 'relief';
              }}
              className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                view === 'Relief'
                  ? 'bg-[#eef4ff] text-[#2563eb]'
                  : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              <ReliefIcon className={`w-5 h-5 shrink-0 ${view === 'Relief' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
              <span>{t.navReliefDesk || 'Relief Desk'}</span>
            </button>
          )}

          {/* Admin Navigation Items */}
          {user?.role === 'admin' && (
            <>
              <button
                type="button"
                onClick={() => {
                  setView('Operations');
                  location.hash = 'operations';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Operations'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <OperationsIcon className={`w-5 h-5 shrink-0 ${view === 'Operations' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.operationsNav || 'Operations'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setView('Crew');
                  location.hash = 'crew';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Crew'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <CrewIcon className={`w-5 h-5 shrink-0 ${view === 'Crew' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.crewNav || 'Crew'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setView('Relief');
                  location.hash = 'relief';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Relief'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <ReliefIcon className={`w-5 h-5 shrink-0 ${view === 'Relief' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.reliefNav || 'Relief'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setView('Admin');
                  location.hash = 'admin';
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  view === 'Admin'
                    ? 'bg-[#eef4ff] text-[#2563eb]'
                    : 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <AdminIcon className={`w-5 h-5 shrink-0 ${view === 'Admin' ? 'text-[#2563eb]' : 'text-slate-800'}`} />
                <span>{t.navAdminConsole || 'Admin Console'}</span>
              </button>
            </>
          )}

          {/* Settings button for all authenticated roles */}
          <button
            type="button"
            onClick={() => {
              setShowProfile(true);
            }}
            className="w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:text-slate-950 transition-all"
          >
            <SettingsIcon className="w-5 h-5 text-slate-800 shrink-0" />
            <span>{t.navSettings || 'Settings'}</span>
          </button>
        </nav>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen bg-[#f8fafc]">
        {/* Top Header Bar */}
        <header className="border-b border-slate-200/80 bg-white sticky top-0 z-30 shadow-2xs">
          <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
            {user?.role === 'citizen' ? (
              /* Centered Search Pill (Citizen view only) */
              <div className="flex-1 max-w-lg">
                <div className="relative w-full">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none z-10">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" y1="21" x2="16.65" y2="16.65" />
                    </svg>
                  </span>
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder || "Search location, shelters, or hazards..."}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100/90 border border-slate-200 rounded-full pr-4 py-2 text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white transition-all m-0"
                    style={{ paddingLeft: '2.6rem', marginTop: 0 }}
                  />
                </div>
              </div>
            ) : (
              /* Workspace Title Pill for Staff Roles */
              <div className="flex items-center gap-2.5">
                <span className="font-extrabold text-sm text-slate-800 tracking-tight">
                  {view === 'Operations'
                    ? (t.operationsWorkspace || 'Operations Incident Desk')
                    : view === 'Relief'
                    ? (t.reliefWorkspace || 'Relief Coordination Desk')
                    : view === 'Crew'
                    ? (t.crewWorkspace || 'Field Crew Work Orders')
                    : view === 'Admin'
                    ? (t.adminWorkspace || 'System Governance & Administration')
                    : `${view} Workspace`}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 uppercase border border-slate-200/60">
                  {user?.role} {t.roleLabelSuffix || 'role'}
                </span>
              </div>
            )}

            {/* Right Controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Language Switcher Pill */}
              <div className="inline-flex rounded-lg p-0.5 bg-[#0f382c] text-white shadow-2xs" role="group" aria-label="Language selection">
                <button
                  type="button"
                  onClick={() => toggleLang('en')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${
                    lang === 'en' ? 'bg-[#1b5e4b] text-white shadow-2xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="Switch interface to English"
                >
                  <span>EN</span>
                  <span className="text-[10px] opacity-80">🌐</span>
                </button>
                <button
                  type="button"
                  onClick={() => toggleLang('si')}
                  className={`px-2 py-1 text-xs font-bold rounded-md transition-all ${
                    lang === 'si' ? 'bg-[#1b5e4b] text-white shadow-2xs' : 'text-slate-300 hover:text-white'
                  }`}
                  title="සිංහල භාෂාවට මාරු වන්න"
                >
                  සිං
                </button>
              </div>

              {/* Notification Bell with Red Badge (Citizen only) */}
              {user?.role === 'citizen' && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveCitizenTab('alerts');
                    if (view !== 'Citizen') location.hash = 'citizen';
                  }}
                  className="relative p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
                  title={`${unreadNotifCount} unread alerts`}
                >
                  <span className="text-base leading-none">🔔</span>
                  {unreadNotifCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-black w-4 h-4 rounded-full flex items-center justify-center shadow-xs">
                      {unreadNotifCount}
                    </span>
                  )}
                </button>
              )}

              {/* User Profile Pill & Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setUserMenuOpen(prev => !prev)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-full hover:bg-slate-100 border border-slate-200/80 transition-all text-xs font-semibold text-slate-700"
                >
                  <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    👤
                  </div>
                  <span className="hidden sm:inline">{t.helloPrefix || 'Hello'}, {displayName}</span>
                  <span className="text-[10px] text-slate-400">▼</span>
                </button>

                {userMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                    <div className="px-3 py-2 border-b border-slate-100">
                      <strong className="block text-slate-800 truncate">{user.fullName || user.username}</strong>
                      <span className="text-slate-400 text-[10px] capitalize">{user.role} {t.roleLabelSuffix || 'role'}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        setShowProfile(true);
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                    >
                      <span>⚙️</span> {t.manageProfileMenu || 'Manage Profile & Security'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center gap-2 border-t border-slate-100"
                    >
                      <span>🚪</span> {t.signOut || 'Sign Out'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>



        {/* Main Workspace Body */}
        <main id="main" className="flex-1 p-4 sm:p-6 w-full max-w-7xl mx-auto">
          {health && !health.ready && (
            <div className="system mb-6 text-rose-800 bg-rose-50 border-rose-300 p-3 rounded-xl border text-xs flex items-center gap-2" role="status">
              <span className="dot animate-pulse" />
              <span>
                {health.server === 'unavailable'
                  ? 'Services temporarily unavailable'
                  : `Connecting: Database ${health.database?.status || 'connecting'}`}
              </span>
            </div>
          )}
          {authError && <p role="alert" className="notice error mb-5 text-xs">{authError}</p>}
          {content()}
          <footer className="mt-12 text-xs text-slate-400 text-center border-t border-slate-200/60 pt-4">
            Reports are not monitored for direct emergency dispatch. Verified warnings, closure-aware safe routes, and emergency shelter allocations are active for simulated demo corridors. Never guarantees real-world safety.
          </footer>
        </main>
      </div>

      {showProfile && user && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onUserUpdated={updated => setUser({ ...user, ...updated })}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
