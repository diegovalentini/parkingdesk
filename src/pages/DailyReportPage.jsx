import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { db, firebase } from '../firebase/firebase';
import { useAuth } from '../auth/AuthContext';
import { formatDuration, formatLongDate, formatMoney, formatMonth, formatTime, LOGS_COLLECTION, logFromDoc, toDateKey } from '../utils/helpers';

function fromDateParts(year, monthIndex, day) { return new Date(year, monthIndex, day, 12, 0, 0, 0); }
function dayRange(date) { const d = new Date(date); const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); return { start, end: start + 24 * 60 * 60 * 1000 }; }
function monthRange(date) { const d = new Date(date); return { start: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() }; }

export default function DailyReportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [monthLogs, setMonthLogs] = useState([]);
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [editing, setEditing] = useState(null);

  async function refresh() {
    try {
      const mr = monthRange(calendarDate);
      const dr = dayRange(selectedDate);
      const monthSnap = await db.collection(LOGS_COLLECTION).where('endTimestamp', '>=', mr.start).where('endTimestamp', '<', mr.end).get();
      const daySnap = await db.collection(LOGS_COLLECTION).where('endTimestamp', '>=', dr.start).where('endTimestamp', '<', dr.end).get();
      setMonthLogs(monthSnap.docs.map(logFromDoc).sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0)));
      setSelectedLogs(daySnap.docs.map(logFromDoc).sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0)));
    } catch (error) {
      console.error('Error cargando historial por día:', error);
      showToast('No se pudo cargar el historial por día. Revisá permisos o conexión.');
    }
  }

  useEffect(() => { refresh(); }, [calendarDate, selectedDate]);

  const counts = useMemo(() => {
    const map = new Map();
    monthLogs.forEach((log) => { if (log.endTimestamp) { const key = toDateKey(log.endTimestamp); map.set(key, (map.get(key) || 0) + 1); } });
    return map;
  }, [monthLogs]);

  const summary = useMemo(() => {
    let cash = 0, mp = 0;
    selectedLogs.forEach((log) => { const amount = Number(log.amount || 0); const method = String(log.payMethod || '').toUpperCase(); if (method.includes('MP')) mp += amount; else cash += amount; });
    return { cash, mp, total: cash + mp, movements: selectedLogs.length };
  }, [selectedLogs]);

  async function saveLog(logId, changes) {
    try {
      await db.collection(LOGS_COLLECTION).doc(logId).set({ ...changes, editedBy: user?.username || user?.email || 'Usuario', editedByUid: user?.uid || null, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
      setEditing(null); await refresh(); showToast('Registro actualizado.');
    } catch (error) { console.error(error); showToast('No se pudo actualizar el registro.'); }
  }
  async function deleteLog(logId) {
    if (!window.confirm('¿Eliminar este registro?')) return;
    try { await db.collection(LOGS_COLLECTION).doc(logId).delete(); await refresh(); showToast('Registro eliminado.'); } catch (error) { console.error(error); showToast('No se pudo eliminar el registro.'); }
  }

  function exportPdf() {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text('Estacionamiento Azul - Reporte diario', 14, 18);
    doc.setFontSize(11); doc.text(formatLongDate(selectedDate), 14, 27);
    doc.text(`Movimientos: ${summary.movements} | Efectivo: ${formatMoney(summary.cash)} | MP: ${formatMoney(summary.mp)} | Total: ${formatMoney(summary.total)}`, 14, 36);
    autoTable(doc, { startY: 45, head: [['Patente', 'Plaza', 'Tipo', 'Entrada', 'Salida', 'Tiempo', 'Método', 'Cobro', 'Abrió', 'Cerró']], body: selectedLogs.map((log) => [log.occupantName || '—', log.spotId || '—', log.vehicleType || '—', formatTime(log.startTimestamp), formatTime(log.endTimestamp), formatDuration(log.startTimestamp, log.endTimestamp), log.payMethod || '—', formatMoney(log.amount), log.openedBy || '—', log.closedBy || '—']) });
    doc.save(`reporte-diario-${toDateKey(selectedDate)}.pdf`);
  }

  return <>
    <Topbar title="Historial por día" links={[{ to: '/admin', label: 'Panel admin' }, { to: '/', label: 'Panel principal' }]} />
    <main className="layout daily-report-layout"><section className="page-title daily-report-hero"><p className="eyebrow">Reporte diario</p><h2>Calendario de movimientos</h2><p className="muted">Elegí un día para consultar y corregir los registros guardados.</p></section><section className="daily-report-grid"><article className="admin-card calendar-card"><div className="calendar-head"><button className="secondary-btn secondary-btn--small" type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}>‹</button><div><h3>{formatMonth(calendarDate)}</h3><p className="muted small-text">Los días con movimientos aparecen marcados.</p></div><button className="secondary-btn secondary-btn--small" type="button" onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}>›</button></div><div className="calendar-weekdays" aria-hidden="true"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><CalendarGrid calendarDate={calendarDate} selectedDate={selectedDate} counts={counts} onSelect={setSelectedDate} /></article><article className="admin-card selected-day-card"><p className="eyebrow">Día seleccionado</p><h3>{formatLongDate(selectedDate)}</h3><p className="muted">Resumen del día elegido.</p><div className="day-summary-grid"><div><span>Movimientos</span><strong>{summary.movements}</strong></div><div><span>Efectivo</span><strong>{formatMoney(summary.cash)}</strong></div><div><span>MP</span><strong>{formatMoney(summary.mp)}</strong></div><div><span>Total</span><strong>{formatMoney(summary.total)}</strong></div></div><div className="report-actions report-actions--inline"><button className="secondary-btn" type="button" onClick={exportPdf}>Exportar PDF diario</button></div></article></section><section className="history-card daily-records-card"><div className="section-head"><div><h3>Registros del día</h3><p className="muted">{selectedLogs.length ? `Mostrando ${selectedLogs.length} movimiento${selectedLogs.length === 1 ? '' : 's'} del día seleccionado.` : 'No hay registros cerrados en este día.'}</p></div></div><DailyRows logs={selectedLogs} onEdit={setEditing} onDelete={deleteLog} /></section></main>
    <DailyEditModal log={editing} onClose={() => setEditing(null)} onSave={saveLog} />
  </>;
}

function CalendarGrid({ calendarDate, selectedDate, counts, onSelect }) {
  const year = calendarDate.getFullYear(), month = calendarDate.getMonth();
  const firstDay = new Date(year, month, 1), lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;
  const todayKey = toDateKey(new Date()), selectedKey = toDateKey(selectedDate);
  const cells = [];
  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;
    if (dayNumber < 1 || dayNumber > lastDay.getDate()) { cells.push(<button key={i} className="calendar-day calendar-day--empty" type="button" disabled></button>); continue; }
    const cellDate = fromDateParts(year, month, dayNumber); const key = toDateKey(cellDate); const count = counts.get(key) || 0;
    const classes = ['calendar-day', key === todayKey ? 'is-today' : '', key === selectedKey ? 'is-selected' : '', count > 0 ? 'has-logs' : ''].filter(Boolean).join(' ');
    cells.push(<button key={key} className={classes} type="button" onClick={() => onSelect(cellDate)} aria-label={`Ver historial del ${key}`}><span className="calendar-day__number">{dayNumber}</span>{count > 0 ? <span className="calendar-day__count">{count}</span> : null}</button>);
  }
  return <div className="calendar-grid" aria-label="Calendario de historial diario">{cells}</div>;
}

function DailyRows({ logs, onEdit, onDelete }) {
  if (!logs.length) return <div className="history-list"><p className="empty-state">No hay movimientos guardados para este día.</p></div>;
  return <div className="history-list">{logs.map((log) => { const method = String(log.payMethod || '').toUpperCase(); const methodClass = method.includes('MP') ? 'history-method--mp' : 'history-method--cash'; return <article className="history-row" key={log.id}><div className="history-row__main"><div className="history-row__plate"><strong>{log.occupantName || '—'}</strong><span>Plaza {log.spotId || '—'} · {log.vehicleType || '—'}</span></div><span className={`history-method ${methodClass}`}>{method || 'Sin método'}</span></div><div className="history-row__grid"><div><span>Entrada</span><strong>{formatTime(log.startTimestamp)}</strong></div><div><span>Salida</span><strong>{formatTime(log.endTimestamp)}</strong></div><div><span>Tiempo</span><strong>{formatDuration(log.startTimestamp, log.endTimestamp)}</strong></div><div><span>Cobro</span><strong>{formatMoney(log.amount)}</strong></div><div><span>Abrió</span><strong>{log.openedBy || log.occupantUser || '—'}</strong></div><div><span>Cerró</span><strong>{log.closedBy || '—'}</strong></div></div><div className="history-row__actions"><button className="secondary-btn secondary-btn--small" type="button" onClick={() => onEdit(log)}>Editar registro</button><button className="danger-btn secondary-btn--small" type="button" onClick={() => onDelete(log.id)}>Eliminar</button></div></article>; })}</div>;
}

function DailyEditModal({ log, onClose, onSave }) {
  const [method, setMethod] = useState('EFECTIVO'); const [amount, setAmount] = useState(''); const [plate, setPlate] = useState('');
  useEffect(() => { if (log) { setMethod(String(log.payMethod || '').toUpperCase().includes('MP') ? 'MP' : 'EFECTIVO'); setAmount(String(log.amount || '')); setPlate(log.occupantName || ''); } }, [log]);
  if (!log) return null;
  return <Modal open={!!log} onClose={onClose} labelledBy="dailyEditTitle"><div className="modal-title"><span>✏️</span><h3 id="dailyEditTitle">Editar registro</h3></div><form className="form-grid" onSubmit={(e) => { e.preventDefault(); onSave(log.id, { payMethod: method, amount: Number(amount), occupantName: plate.trim().toUpperCase() }); }}><label className="form-field"><span>Patente</span><input value={plate} onChange={(e) => setPlate(e.target.value)} required /></label><label className="form-field"><span>Monto</span><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" required /></label><label className="form-field"><span>Método de pago</span><select value={method} onChange={(e) => setMethod(e.target.value)} required><option value="EFECTIVO">Efectivo</option><option value="MP">MP</option></select></label><div className="modal-actions"><button className="ghost-btn" type="button" onClick={onClose}>Cerrar</button><button className="primary-btn" type="submit">Guardar</button></div></form></Modal>;
}
