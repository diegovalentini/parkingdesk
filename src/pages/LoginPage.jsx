import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { useThemeClock } from '../components/Topbar';

export default function LoginPage() {
  const { user, login } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const { clock, dark, toggleTheme } = useThemeClock();

useEffect(() => {
  if (!user) return;

  if (user.role === 'platform_admin') {
    navigate('/platform', { replace: true });
  } else {
    navigate('/', { replace: true });
  }
}, [navigate, user]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const error = await login(form.get('email'), form.get('password'));
    setLoading(false);
    if (error) return showToast(error);
  }


  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="auth-card__head">
          <span id="liveClock" className="clock">{clock}</span>
          <button id="themeToggle" className="icon-btn" type="button" aria-label="Cambiar tema" onClick={toggleTheme}>{dark ? '☀️' : '🌙'}</button>
        </div>
        <div className="auth-brand">
          <p className="eyebrow">Acceso al sistema</p>
          <h1>ParkingDesk</h1>
          <p className="muted">Ingresá con tu usuario para acceder al panel.</p>
        </div>
        <form
  id="loginForm"
  className="form-grid"
  onSubmit={handleLogin}
>
  <label className="form-field">
    <span>Email</span>

    <input
      name="email"
      type="email"
      autoComplete="email"
      required
      placeholder="usuario@email.com"
    />
  </label>

  <label className="form-field">
    <span>Contraseña</span>

    <input
      name="password"
      type="password"
      autoComplete="current-password"
      required
      placeholder="Tu contraseña"
    />
  </label>

  <button
    className="primary-btn full-btn"
    type="submit"
    disabled={loading}
  >
    Ingresar
  </button>

  <p className="muted small-text">
    Si necesitás una cuenta, solicitásela al administrador de tu playa.
  </p>
</form>
      </section>
    </main>
  );
}
