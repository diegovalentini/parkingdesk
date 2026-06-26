export const THEME_KEY = 'ea_theme';
export const SPOTS_COLLECTION = 'spots';
export const LOGS_COLLECTION = 'logs';
export const SETTINGS_DOC = 'settings/config';
export const BLACKLIST_KEY = 'ea_demo_blacklist_v1';
export const LOGS_KEY = 'ea_demo_logs_v1';

export function normalizePlate(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function safeText(value, fallback = '—') {
  const text = String(value || '').trim();
  return text || fallback;
}

export function formatMoney(value) {
  return `€ ${Number(value || 0).toFixed(2)}`;
}

export function formatDate(value) {
  if (!value) return '—';
  if (typeof value.toDate === 'function') return value.toDate().toLocaleDateString('es-ES');
  if (typeof value.toMillis === 'function') return new Date(value.toMillis()).toLocaleDateString('es-ES');
  return new Date(value).toLocaleDateString('es-ES');
}

export function toMillis(value) {
  if (!value) return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value.toMillis === 'function') return value.toMillis();
  if (value.seconds) return value.seconds * 1000;
  return null;
}

export function formatTime(timestamp) {
  if (!timestamp) return '—';
  const date = new Date(timestamp);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} ${hours}:${minutes}`;
}

export function formatDuration(startTimestamp, endTimestamp = Date.now()) {
  if (!startTimestamp || !endTimestamp) return '—';
  const totalMinutes = Math.max(0, Math.floor((endTimestamp - startTimestamp) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} min`;
  return `${hours} h ${minutes} min`;
}

export function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 24 * 60 * 60 * 1000;
  return { start, end };
}

export function toDateKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateInput(value) {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function formatShortDate(value) {
  return new Date(value).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatLongDate(value) {
  return new Date(value).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export function formatMonth(value) {
  return new Date(value).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

export function sanitizePdfText(value) {
  return String(value ?? '—').replace(/\s+/g, ' ').trim() || '—';
}

export function sortSpots(list) {
  return [...list].sort((a, b) => {
    const aId = String(a.id || '');
    const bId = String(b.id || '');
    const aMoto = aId.startsWith('M');
    const bMoto = bId.startsWith('M');
    if (aMoto && !bMoto) return -1;
    if (!aMoto && bMoto) return 1;
    return Number(aId.replace('M', '')) - Number(bId.replace('M', ''));
  });
}

export function spotFromDoc(doc) {
  const data = doc.data() || {};
  return {
    id: String(data.id || doc.id),
    type: data.type || (String(data.id || doc.id).startsWith('M') ? 'moto' : 'auto'),
    occupied: data.occupied === true,
    blocked: data.blocked === true,
    occupantName: data.occupantName || null,
    plateNormalized: data.plateNormalized || null,
    startTimestamp: toMillis(data.startTimestamp),
    vehicleType: data.vehicleType || null,
    hasKey: data.hasKey === true,
    openedBy: data.openedBy || null,
    openedByUid: data.openedByUid || null,
  };
}

export function logFromDoc(doc) {
  const data = doc.data() || {};
  return { id: doc.id, ...data, startTimestamp: toMillis(data.startTimestamp), endTimestamp: toMillis(data.endTimestamp) };
}
