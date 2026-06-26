import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { useThemeClock } from '../components/Topbar';

export default function LoginPage() {
  const { user, login, registerUser } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [tab, setTab] = useState('login');
  const [loading, setLoading] = useState(false);
  const { clock, dark, toggleTheme } = useThemeClock();

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [navigate, user]);

  async function handleLogin(event) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const error = await login(form.get('email'), form.get('password'));
    setLoading(false);
    if (error) return showToast(error);
    navigate('/', { replace: true });
  }

  async function handleRegister(event) {
    event.preventDefault();
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const error = await registerUser({ username: form.get('username'), email: form.get('email'), password: form.get('password') });
    setLoading(false);
    if (error) return showToast(error);
    showToast('Cuenta creada. Un administrador debe habilitar tus permisos.');
    navigate('/', { replace: true });
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
          <h1>Estacionamiento Azul</h1>
          <p className="muted">Ingresá con tu usuario para acceder al panel.</p>
        </div>
        <div className="auth-tabs" role="tablist" aria-label="Acceso">
          <button className={`auth-tab ${tab === 'login' ? 'is-active' : ''}`} type="button" onClick={() => setTab('login')}>Ingresar</button>
          <button className={`auth-tab ${tab === 'register' ? 'is-active' : ''}`} type="button" onClick={() => setTab('register')}>Crear cuenta</button>
        </div>
        {tab === 'login' ? (
          <form id="loginForm" className="form-grid" onSubmit={handleLogin}>
            <label className="form-field"><span>Email</span><input name="email" type="email" autoComplete="email" required placeholder="usuario@email.com" /></label>
            <label className="form-field"><span>Contraseña</span><input name="password" type="password" autoComplete="current-password" required placeholder="Tu contraseña" /></label>
            <button className="primary-btn full-btn" type="submit" disabled={loading}>Ingresar</button>
          </form>
        ) : (
          <form id="registerForm" className="form-grid" onSubmit={handleRegister}>
            <label className="form-field"><span>Nombre de usuario</span><input name="username" type="text" autoComplete="name" required placeholder="Ej: Diego" /></label>
            <label className="form-field"><span>Email</span><input name="email" type="email" autoComplete="email" required placeholder="usuario@email.com" /></label>
            <label className="form-field"><span>Contraseña</span><input name="password" type="password" autoComplete="new-password" minLength="6" required placeholder="Mínimo 6 caracteres" /></label>
            <button className="primary-btn full-btn" type="submit" disabled={loading}>Crear cuenta</button>
            <p className="muted small-text">Tu cuenta quedará pendiente hasta que un administrador habilite permisos.</p>
          </form>
        )}
      </section>
    </main>
  );
}
