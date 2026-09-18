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

const allViews = ['Citizen', 'Operations', 'Crew', 'Relief', 'Admin'];
const roleViews = {
  citizen: ['Citizen'],
  officer: ['Operations', 'Crew', 'Relief', 'Citizen'],
  crew: ['Crew', 'Operations'],
  relief: ['Relief', 'Operations'],
  admin: ['Operations', 'Crew', 'Relief', 'Admin', 'Citizen'],
};

function App() {
  const [view, setView] = useState(() => allViews.find(v => `#${v.toLowerCase()}` === location.hash) || 'Citizen');
  const [health, setHealth] = useState(null);
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [authError, setAuthError] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [lang, setLang] = useState(() => localStorage.getItem('rl_lang') || 'en');

  const t = i18n[lang] || i18n.en;

  function toggleLang(newLang) {
    setLang(newLang);
    try { localStorage.setItem('rl_lang', newLang); } catch {}
  }

  useEffect(() => {
    const change = () => setView(allViews.find(v => `#${v.toLowerCase()}` === location.hash) || 'Citizen');
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  const availableViews = user ? (roleViews[user.role] || ['Citizen']) : ['Citizen'];

  // Check health periodically with shorter initial interval for fast recovery
  useEffect(() => {
    let active = true;
    const check = () => fetch('/api/health', { signal: AbortSignal.timeout(5000) })
      .then(async r => {
        const text = await r.text();
        return text && text.trim().length > 0 ? JSON.parse(text) : { server: 'unavailable' };
      })
      .then(data => { if (active) setHealth(data); })
      .catch(() => { if (active) setHealth({ server: 'unavailable' }); });
    check();
    const timer = setInterval(check, 10000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  // Fetch session, retrying smoothly when database connects
  useEffect(() => {
    let active = true;
    let retryTimer = null;

    async function loadSession() {
      try {
        const data = await request('/api/auth/me');
        if (active) {
          setUser(data.user);
          setAuthError('');
          setChecking(false);
        }
      } catch (e) {
        if (!active) return;
        // If database is still connecting (HTTP 503), retry automatically in 2 seconds
        if (e.status === 503 || e.message?.includes('Database')) {
          retryTimer = setTimeout(loadSession, 2000);
        } else {
          setAuthError(e.message);
          setChecking(false);
        }
      }
    }

    loadSession();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [health?.ready]);

  function signedIn(value) {
    setUser(value);
    setAuthError('');
    location.hash = ({ citizen: 'citizen', officer: 'operations', admin: 'operations', relief: 'relief', crew: 'crew' })[value.role];
  }

  async function signOut() {
    try {
      await request('/api/auth/logout', { method: 'POST' });
      setUser(null);
      setAuthError('');
    } catch (e) {
      setAuthError(e.message);
    }
  }

  function content() {
    if (checking) return <p role="status" className="py-6 text-slate-500">Checking your session…</p>;
    if (!user) return <AuthPanel onUser={signedIn} />;
    if (view === 'Citizen' && user.role === 'citizen') return <Citizen lang={lang} t={t} />;
    if (view === 'Operations' && ['officer', 'admin'].includes(user.role)) return <ReportQueue title="Report inbox" />;
    if (view === 'Crew' && ['crew', 'officer', 'admin'].includes(user.role)) return <Crew />;
    if (view === 'Relief' && ['relief', 'officer', 'admin'].includes(user.role)) return <Relief />;
    if (view === 'Admin' && user.role === 'admin') return <Admin />;
    return (
      <section className="panel">
        <span className="badge">Access restricted</span>
        <h2 className="mt-4">This view requires a different role</h2>
        <p className="muted">You are signed in as {user.role}. The server independently enforces access. Sign out to use another authorized account.</p>
      </section>
    );
  }

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip">Skip to content</a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-5 py-5 flex flex-wrap items-center justify-between gap-4">
          <a href="#citizen" className="flex items-center gap-3.5 group">
            <img src="/logo.png" alt="Resilient Lanka Emblem" className="h-12 w-auto object-contain drop-shadow-md transition-transform duration-200 group-hover:scale-105" />
            <div>
              <span className="block font-extrabold text-xl tracking-tight text-slate-900 leading-tight">{t.platformName}</span>
              <span className="block text-[11px] font-semibold uppercase tracking-wider text-sky-700">{t.platformSubtitle}</span>
            </div>
          </a>
          <div className="flex flex-wrap items-center gap-3">
            {/* Bilingual Switcher */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200" role="group" aria-label="Language selection">
              <button
                type="button"
                onClick={() => toggleLang('en')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${lang === 'en' ? 'bg-[#113c32] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                title="Switch interface to English"
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => toggleLang('si')}
                className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${lang === 'si' ? 'bg-[#113c32] text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'}`}
                title="සිංහල භාෂාවට මාරු වන්න"
              >
                සිං
              </button>
            </div>

            {user && (
              <>
                <span className="text-xs font-medium text-slate-600">
                  {user.fullName ? `${user.fullName} (@${user.username})` : user.username} · {user.role}{user.demo ? ' · demo' : ''}
                </span>
                <button
                  type="button"
                  className="secondary text-xs flex items-center gap-1.5 py-1 px-3"
                  onClick={() => setShowProfile(true)}
                  title="View profile, edit personal details, and change password"
                >
                  <span>👤</span> {t.profile}
                </button>
                <button className="secondary text-xs py-1 px-3" onClick={signOut}>{t.signOut}</button>
              </>
            )}
          </div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl md:grid md:grid-cols-[205px_1fr]">
        <nav aria-label="Main navigation" className="p-5 md:pt-9 flex gap-2 overflow-x-auto md:flex-col">
          {availableViews.map(name => {
            const navLabel = ({
              Citizen: t.citizenNav,
              Operations: t.operationsNav,
              Crew: t.crewNav,
              Relief: t.reliefNav,
              Admin: t.adminNav,
            })[name] || name;
            return (
              <a key={name} href={`#${name.toLowerCase()}`} aria-current={view === name ? 'page' : undefined} className={`nav-link ${view === name ? 'active' : ''}`}>
                <span className="font-semibold text-sm">{navLabel}</span>
              </a>
            );
          })}
        </nav>
        <main id="main" className="px-5 pt-4 pb-12 md:pt-9 min-w-0">
          <div className="eyebrow">REPORT · REVIEW · RESPOND</div>
          <h1>{view === 'Citizen' ? 'Every report matters.' : view === 'Operations' ? 'Understand what’s reported.' : `${view} workspace`}</h1>
          <p className="muted mb-7">A foundation for coordinated disaster response across Sri Lanka.</p>
          {health && !health.ready && (
            <div className="system mb-6 text-rose-800 bg-rose-50 border-rose-300" role="status">
              <span className="dot" />
              {health.server === 'unavailable' ? 'Services temporarily unavailable' : `Connecting: Database ${health.database?.status || 'connecting'}`}
            </div>
          )}
          {authError && <p role="alert" className="notice error mb-5">{authError}</p>}
          {content()}
          <footer className="mt-8 text-xs text-slate-500">Reports are not monitored for emergency dispatch. Verified warnings, closure-aware safe routes, and emergency shelter allocations are active for simulated demo corridors. Never guarantees real-world safety.</footer>
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
