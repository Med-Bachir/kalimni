import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, getToken, setToken } from './api';
import { useI18n } from './i18n.jsx';
import Login from './pages/Login.jsx';
import Patients from './pages/Patients.jsx';
import PatientDetail from './pages/PatientDetail.jsx';
import Alerts from './pages/Alerts.jsx';
import Rota from './pages/Rota.jsx';

// The console is for specialists and admins. Patients have the mobile app —
// and every clinical endpoint here refuses them anyway; this only avoids
// showing a signed-in patient a wall of 403s.
export default function App() {
  const { t, lang, setLang } = useI18n();
  const navigate = useNavigate();
  const [booted, setBooted] = useState(false);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api('/auth/me'),
    enabled: !!getToken(),
    retry: false,
  });

  useEffect(() => {
    if (!getToken() || me.isFetched || me.isError) setBooted(true);
  }, [me.isFetched, me.isError]);

  const user = me.data?.user || null;
  const isAdmin = user?.role === 'admin';

  const logout = () => {
    setToken(null);
    me.remove?.();
    navigate('/login');
    window.location.reload();
  };

  if (!booted) return <div className="center muted">{t('loading')}</div>;
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login onSignedIn={() => window.location.reload()} />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <span className="brand">{t('appName')}</span>
        <nav>
          <NavLink to="/patients" className={({ isActive }) => (isActive ? 'active' : '')}>{t('patients')}</NavLink>
          <NavLink to="/alerts" className={({ isActive }) => (isActive ? 'active' : '')}>{t('alerts')}</NavLink>
          {isAdmin && (
            <NavLink to="/rota" className={({ isActive }) => (isActive ? 'active' : '')}>{t('rota')}</NavLink>
          )}
        </nav>
        <div className="spacer" />
        <button className="link" onClick={() => setLang(lang === 'ar' ? 'fr' : 'ar')}>
          {lang === 'ar' ? 'Français' : 'العربية'}
        </button>
        <span className="muted small">{user.name}</span>
        <button className="ghost" onClick={logout}>{t('logout')}</button>
      </header>

      <main className="main">
        <Routes>
          <Route path="/patients" element={<Patients />} />
          <Route path="/patients/:id" element={<PatientDetail />} />
          <Route path="/alerts" element={<Alerts isAdmin={isAdmin} />} />
          {isAdmin && <Route path="/rota" element={<Rota />} />}
          <Route path="*" element={<Navigate to={isAdmin ? '/alerts' : '/patients'} replace />} />
        </Routes>
      </main>
    </div>
  );
}
