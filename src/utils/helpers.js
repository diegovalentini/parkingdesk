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
  const amount = Number(value || 0 );

  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits:0,
    maximumFractionDigits:0,

  }).format(amount);
  return `$ ${formatted}`;
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
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(timestamp));
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
  const str = new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date());
  const [y, mo, d] = str.split('-').map(Number);
  const start = Date.UTC(y, mo - 1, d, 3, 0, 0, 0); // medianoche AR = 03:00 UTC
  return { start, end: start + 24 * 60 * 60 * 1000 };
}

export function toDateKey(date) {
  const d = new Date(date);
  const str = new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(d); // devuelve "YYYY-MM-DD" siempre en AR
  return str;
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
