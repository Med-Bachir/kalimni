import { useState } from 'react';
import { api, setToken } from '../api';
import { useI18n } from '../i18n.jsx';

export default function Login({ onSignedIn }) {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { email, password } });
      // A patient signing in here would only meet 403s — say so plainly
      // instead of dropping them into an empty console.
      if (user.role !== 'specialist' && user.role !== 'admin') {
        setError(t('loginRoleError'));
        return;
      }
      setToken(token);
      onSignedIn();
    } catch (err) {
      setError(err.code === 'rate_limited' ? t('loginError') : t('loginError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center">
      <form className="card" style={{ width: 380 }} onSubmit={submit}>
        <h1 style={{ marginBottom: 4 }}>{t('appName')}</h1>
        <p className="muted small" style={{ marginTop: 0, marginBottom: 18 }}>{t('login')}</p>

        <div className="field">
          <label htmlFor="email">{t('email')}</label>
          <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                 autoComplete="username" dir="ltr" required />
        </div>
        <div className="field">
          <label htmlFor="password">{t('password')}</label>
          <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                 autoComplete="current-password" dir="ltr" required />
        </div>

        {error && <p style={{ color: 'var(--danger-dark)', fontSize: 13 }}>{error}</p>}

        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? t('loading') : t('login')}
        </button>
      </form>
    </div>
  );
}
