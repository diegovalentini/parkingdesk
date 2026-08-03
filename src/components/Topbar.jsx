import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { safeText, THEME_KEY } from '../utils/helpers';

export function useThemeClock() {
  const [clock, setClock] = useState('--:--');
  const [dark, setDark] = useState(() => localStorage.getItem(THEME_KEY) === 'dark');

  useEffect(() => {
    document.body.classList.toggle('dark', dark);
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setClock(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    };
    update();
    const timer = window.setInterval(update, 30000);
    return () => window.clearInterval(timer);
  }, []);

  return { clock, dark, toggleTheme: () => setDark((value) => !value) };
}

export default function Topbar({ title = 'Estacionamiento Azul', links = [] }) {
      const {
      user,
      logout,
      isInspectingParkingLot,
      exitParkingLotAsPlatform,
    } = useAuth();
  const { clock, dark, toggleTheme } = useThemeClock();

  const navigate = useNavigate();

function handleBackToPlatform() {
  exitParkingLotAsPlatform();
  navigate('/platform', { replace: true });
}

  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span id="liveClock" className="clock">{clock}</span>
        <h1>{title}</h1>
      </div>
      <div className="topbar__actions">
        {user ? <span id="userBadge" className="user-badge">{safeText(user.username, 'Usuario')} · {String(user.role || 'viewer').toUpperCase()}</span> : null}
        {links.map((link) => <Link key={link.to} className="ghost-link" to={link.to}>{link.label}</Link>)}
        <button id="themeToggle" className="icon-btn" type="button" aria-label="Cambiar tema" onClick={toggleTheme}>{dark ? '☀️' : '🌙'}</button>
        {isInspectingParkingLot ? (
          <button
            type="button"
            className="secondary-btn"
            onClick={handleBackToPlatform}
          >
            ← Volver a plataforma
          </button>
        ) : null}
        {user ? <button id="logoutBtn" className="secondary-btn" type="button" onClick={logout}>Salir</button> : null}
      </div>
    </header>
  );
}
