import { useEffect, useMemo, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { db, firebase } from '../firebase/firebase';
import { useAuth } from '../auth/AuthContext';
import {
  formatDuration,
  formatLongDate,
  formatMoney,
  formatMonth,
  formatTime,
  LOGS_COLLECTION,
  logFromDoc,
  toDateKey,
} from '../utils/helpers';

function fromDateParts(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12, 0, 0, 0);
}


function todayAR() {
  const str = new Intl.DateTimeFormat('sv', {
    timeZone: 'America/Argentina/Buenos_Aires',
  }).format(new Date()); // "YYYY-MM-DD"
  const [y, mo, d] = str.split('-').map(Number);
  return new Date(y, mo - 1, d, 12, 0, 0, 0);
}


function dayRange(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  // Medianoche en Argentina (UTC-3) = 03:00 UTC
  const start = Date.UTC(y, m, d, 3, 0, 0, 0);
  return { start, end: start + 24 * 60 * 60 * 1000 };
}


function monthRange(date) {
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    start: Date.UTC(y, m, 1, 3, 0, 0, 0),
    end: Date.UTC(y, m + 1, 1, 3, 0, 0, 0),
  };
}

function cleanPdfText(value) {
  return String(value || '—')
    .replace(/\s+/g, ' ')
    .trim();
}
function formatPdfMoney(value) {
  const amount = Number(value || 0);

  const formatted = new Intl.NumberFormat('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

  return `$ ${formatted}`;
}

function formatDurationMs(ms) {
  const totalMinutes = Math.max(0, Math.floor(Number(ms || 0) / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

function buildDailyPdfStats(logs) {
  const byUser = new Map();

  const stats = {
    movements: logs.length,
    cash: 0,
    mp: 0,
    total: 0,
    totalDurationMs: 0,
    avgDurationMs: 0,
    auto: 0,
    camioneta: 0,
    moto: 0,
    otros: 0,
    byUser: [],
  };

  logs.forEach((log) => {
    const amount = Number(log.amount || 0);
    const method = String(log.payMethod || '').toUpperCase();
    const vehicle = String(log.vehicleType || '').toLowerCase();
    const closedBy = cleanPdfText(log.closedBy || '—');

    const start = Number(log.startTimestamp || 0);
    const end = Number(log.endTimestamp || 0);

    if (start && end && end >= start) {
      stats.totalDurationMs += end - start;
    }

    if (method.includes('MP')) {
      stats.mp += amount;
    } else {
      stats.cash += amount;
    }

    if (vehicle.includes('moto')) {
      stats.moto += 1;
    } else if (vehicle.includes('camioneta')) {
      stats.camioneta += 1;
    } else if (vehicle.includes('auto')) {
      stats.auto += 1;
    } else {
      stats.otros += 1;
    }

    if (!byUser.has(closedBy)) {
      byUser.set(closedBy, {
        user: closedBy,
        cash: 0,
        mp: 0,
        total: 0,
        movements: 0,
      });
    }

    const userRow = byUser.get(closedBy);

    userRow.movements += 1;

    if (method.includes('MP')) {
      userRow.mp += amount;
    } else {
      userRow.cash += amount;
    }

    userRow.total += amount;
  });

  stats.total = stats.cash + stats.mp;
  stats.avgDurationMs = stats.movements
    ? stats.totalDurationMs / stats.movements
    : 0;

  stats.byUser = Array.from(byUser.values()).sort((a, b) => b.total - a.total);

  return stats;
}

export default function DailyReportPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [calendarDate, setCalendarDate] = useState(() => todayAR());
  const [selectedDate, setSelectedDate] = useState(() => todayAR());
  const [monthLogs, setMonthLogs] = useState([]);
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  async function refresh() {
    try {
      const mr = monthRange(calendarDate);
      const dr = dayRange(selectedDate);

      const monthSnap = await db
        .collection(LOGS_COLLECTION)
        .where('endTimestamp', '>=', mr.start)
        .where('endTimestamp', '<', mr.end)
        .get();

      const daySnap = await db
        .collection(LOGS_COLLECTION)
        .where('endTimestamp', '>=', dr.start)
        .where('endTimestamp', '<', dr.end)
        .get();

      setMonthLogs(
        monthSnap.docs
          .map(logFromDoc)
          .sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0))
      );

      setSelectedLogs(
        daySnap.docs
          .map(logFromDoc)
          .sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0))
      );
    } catch (error) {
      console.error('Error cargando historial por día:', error);
      showToast('No se pudo cargar el historial por día. Revisá permisos o conexión.');
    }
  }


useEffect(() => {
  const { start, end } = monthRange(calendarDate);
  const unsub = db
    .collection(LOGS_COLLECTION)
    .where('endTimestamp', '>=', start)
    .where('endTimestamp', '<', end)
    .onSnapshot(
      (snap) => setMonthLogs(
        snap.docs.map(logFromDoc).sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0))
      ),
      (err) => {
        console.error(err);
        showToast('No se pudo cargar el historial del mes.');
      }
    );
  return () => unsub();
}, [calendarDate]);

useEffect(() => {
  const { start, end } = dayRange(selectedDate);
  const unsub = db
    .collection(LOGS_COLLECTION)
    .where('endTimestamp', '>=', start)
    .where('endTimestamp', '<', end)
    .onSnapshot(
      (snap) => setSelectedLogs(
        snap.docs.map(logFromDoc).sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0))
      ),
      (err) => {
        console.error(err);
        showToast('No se pudo cargar el historial del día.');
      }
    );
  return () => unsub();
}, [selectedDate]);

  const counts = useMemo(() => {
    const map = new Map();

    monthLogs.forEach((log) => {
      if (log.endTimestamp) {
        const key = toDateKey(log.endTimestamp);
        map.set(key, (map.get(key) || 0) + 1);
      }
    });

    return map;
  }, [monthLogs]);

  const summary = useMemo(() => {
    let cash = 0;
    let mp = 0;

    selectedLogs.forEach((log) => {
      const amount = Number(log.amount || 0);
      const method = String(log.payMethod || '').toUpperCase();

      if (method.includes('MP')) {
        mp += amount;
      } else {
        cash += amount;
      }
    });

    return {
      cash,
      mp,
      total: cash + mp,
      movements: selectedLogs.length,
    };
  }, [selectedLogs]);

  async function saveLog(logId, changes) {
    try {
      await db.collection(LOGS_COLLECTION).doc(logId).set(
        {
          ...changes,
          editedBy: user?.username || user?.email || 'Usuario',
          editedByUid: user?.uid || null,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      setEditing(null);
      showToast('Registro actualizado.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo actualizar el registro.');
    }
  }

function askDeleteLog(log) {
  setDeleteTarget(log);
}

async function confirmDeleteLog() {
  if (!deleteTarget?.id) return;

  try {
    await db.collection(LOGS_COLLECTION).doc(deleteTarget.id).delete();
    setDeleteTarget(null);
    showToast('Registro eliminado.');
  } catch (error) {
    console.error(error);
    showToast('No se pudo eliminar el registro.');
  }
}

  function exportPdf() {
    const stats = buildDailyPdfStats(selectedLogs);
    const doc = new jsPDF();

    const pageWidth = doc.internal.pageSize.getWidth();
    const marginX = 14;

    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Historial Diario - Estacionamiento Azul', marginX, 18);

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.text(`Fecha: ${formatLongDate(selectedDate)}`, marginX, 28);

    autoTable(doc, {
      startY: 38,
      margin: {
        left: marginX,
        right: marginX,
      },
      theme: 'grid',
      tableWidth: (pageWidth - marginX * 2 - 8) / 2,
      head: [['Resumen del día', '']],
      body: [
        ['Total registros', String(stats.movements)],
        ['Tiempo total', formatDurationMs(stats.totalDurationMs)],
        ['Promedio por vehículo', formatDurationMs(stats.avgDurationMs)],
        ['Total cobrado del día', formatPdfMoney(stats.total)],
        ['Cobrado en efectivo', formatPdfMoney(stats.cash)],
        ['Cobrado en MP', formatPdfMoney(stats.mp)],
        ['Autos', String(stats.auto)],
        ['Camionetas', String(stats.camioneta)],
        ['Motos', String(stats.moto)],
        ['Otros', String(stats.otros)],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: [174, 216, 246],
        textColor: [20, 32, 45],
        fontStyle: 'bold',
      },
      columnStyles: {
        0: {
          fontStyle: 'bold',
        },
        1: {
          halign: 'right',
        },
      },
    });

    autoTable(doc, {
      startY: 38,
      margin: {
        left: marginX + (pageWidth - marginX * 2) / 2 + 4,
        right: marginX,
      },
      theme: 'grid',
      tableWidth: (pageWidth - marginX * 2 - 8) / 2,
      head: [['Usuario', 'Efectivo', 'MP', 'Total']],
      body: stats.byUser.length
        ? stats.byUser.map((item) => [
            item.user,
            formatPdfMoney(item.cash),
            formatPdfMoney(item.mp),
            formatPdfMoney(item.total),
          ])
        : [['—', formatPdfMoney(0), formatPdfMoney(0), formatPdfMoney(0)]],
      styles: {
        fontSize: 8.5,
        cellPadding: 2.5,
      },
      headStyles: {
        fillColor: [174, 216, 246],
        textColor: [20, 32, 45],
        fontStyle: 'bold',
      },
      columnStyles: {
        1: {
          halign: 'right',
        },
        2: {
          halign: 'right',
        },
        3: {
          halign: 'right',
          fontStyle: 'bold',
        },
      },
    });

    const firstTablesEndY = Math.max(
      doc.lastAutoTable?.finalY || 38,
      88
    );

    autoTable(doc, {
      startY: firstTablesEndY + 10,
      margin: {
        left: marginX,
        right: marginX,
      },
      head: [
        [
          'Plaza',
          'Patente',
          'Tipo',
          'Entrada',
          'Salida',
          'Durac.',
          'Cobro',
          'Método',
          'Abrió',
          'Cerró',
        ],
      ],
      body: selectedLogs.map((log) => [
        log.spotId || '—',
        log.occupantName || '—',
        log.vehicleType || '—',
        formatTime(log.startTimestamp),
        formatTime(log.endTimestamp),
        formatDuration(log.startTimestamp, log.endTimestamp),
        formatPdfMoney(log.amount),
        log.payMethod || '—',
        log.openedBy || '—',
        log.closedBy || '—',
      ]),
      styles: {
        fontSize: 8,
        cellPadding: 2.2,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: [43, 132, 186],
        textColor: 255,
        fontStyle: 'bold',
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      columnStyles: {
        0: {
          cellWidth: 13,
        },
        1: {
          cellWidth: 22,
        },
        2: {
          cellWidth: 18,
        },
        3: {
          cellWidth: 16,
        },
        4: {
          cellWidth: 16,
        },
        5: {
          cellWidth: 18,
        },
        6: {
          cellWidth: 22,
          halign: 'right',
        },
        7: {
          cellWidth: 20,
        },
      },
    });

    doc.save(`reporte-diario-${toDateKey(selectedDate)}.pdf`);
  }

  return (
    <>
      <Topbar
        title="Historial por día"
        links={[
          {
            to: '/admin',
            label: 'Panel admin',
          },
          {
            to: '/',
            label: 'Panel principal',
          },
        ]}
      />

      <main className="layout daily-report-layout">
        <section className="page-title daily-report-hero">
          <p className="eyebrow">Reporte diario</p>
          <h2>Calendario de movimientos</h2>
          <p className="muted">Elegí un día para consultar y corregir los registros guardados.</p>
        </section>

        <section className="daily-report-grid">
          <article className="admin-card calendar-card">
            <div className="calendar-head">
              <button
                className="secondary-btn secondary-btn--small"
                type="button"
                onClick={() =>
                  setCalendarDate(
                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1)
                  )
                }
              >
                ‹
              </button>

              <div>
                <h3>{formatMonth(calendarDate)}</h3>
                <p className="muted small-text">Los días con movimientos aparecen marcados.</p>
              </div>

              <button
                className="secondary-btn secondary-btn--small"
                type="button"
                onClick={() =>
                  setCalendarDate(
                    new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1)
                  )
                }
              >
                ›
              </button>
            </div>

            <div className="calendar-weekdays" aria-hidden="true">
              <span>Lun</span>
              <span>Mar</span>
              <span>Mié</span>
              <span>Jue</span>
              <span>Vie</span>
              <span>Sáb</span>
              <span>Dom</span>
            </div>

            <CalendarGrid
              calendarDate={calendarDate}
              selectedDate={selectedDate}
              counts={counts}
              onSelect={setSelectedDate}
            />
          </article>

          <article className="admin-card selected-day-card">
            <p className="eyebrow">Día seleccionado</p>
            <h3>{formatLongDate(selectedDate)}</h3>
            <p className="muted">Resumen del día elegido.</p>

            <div className="day-summary-grid">
              <div>
                <span>Movimientos</span>
                <strong>{summary.movements}</strong>
              </div>

              <div>
                <span>Efectivo</span>
                <strong>{formatMoney(summary.cash)}</strong>
              </div>

              <div>
                <span>MP</span>
                <strong>{formatMoney(summary.mp)}</strong>
              </div>

              <div>
                <span>Total</span>
                <strong>{formatMoney(summary.total)}</strong>
              </div>
            </div>

            <div className="report-actions report-actions--inline">
              <button className="secondary-btn" type="button" onClick={exportPdf}>
                Exportar PDF diario
              </button>
            </div>
          </article>
        </section>

        <section className="history-card daily-records-card">
          <div className="section-head">
            <div>
              <h3>Registros del día</h3>
              <p className="muted">
                {selectedLogs.length
                  ? `Mostrando ${selectedLogs.length} movimiento${
                      selectedLogs.length === 1 ? '' : 's'
                    } del día seleccionado.`
                  : 'No hay registros cerrados en este día.'}
              </p>
            </div>
          </div>

          <DailyRows logs={selectedLogs} onEdit={setEditing} onDelete={askDeleteLog} />
        </section>
      </main>

      <DailyEditModal log={editing} onClose={() => setEditing(null)} onSave={saveLog} />

      <DeleteLogModal
        log={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteLog}
      />
    </>
  );
}

function CalendarGrid({ calendarDate, selectedDate, counts, onSelect }) {
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const totalCells = Math.ceil((startOffset + lastDay.getDate()) / 7) * 7;

  const todayKey = toDateKey(todayAR());
  const selectedKey = toDateKey(selectedDate);
  const cells = [];

  for (let i = 0; i < totalCells; i += 1) {
    const dayNumber = i - startOffset + 1;

    if (dayNumber < 1 || dayNumber > lastDay.getDate()) {
      cells.push(
        <button
          key={i}
          className="calendar-day calendar-day--empty"
          type="button"
          disabled
        ></button>
      );

      continue;
    }

    const cellDate = fromDateParts(year, month, dayNumber);
    const key = toDateKey(cellDate);
    const count = counts.get(key) || 0;

    const classes = [
      'calendar-day',
      key === todayKey ? 'is-today' : '',
      key === selectedKey ? 'is-selected' : '',
      count > 0 ? 'has-logs' : '',
    ]
      .filter(Boolean)
      .join(' ');

    cells.push(
      <button
        key={key}
        className={classes}
        type="button"
        onClick={() => onSelect(cellDate)}
        aria-label={`Ver historial del ${key}`}
      >
        <span className="calendar-day__number">{dayNumber}</span>
        {count > 0 ? <span className="calendar-day__count">{count}</span> : null}
      </button>
    );
  }

  return (
    <div className="calendar-grid" aria-label="Calendario de historial diario">
      {cells}
    </div>
  );
}

function DailyRows({ logs, onEdit, onDelete }) {
  if (!logs.length) {
    return (
      <div className="history-list">
        <p className="empty-state">No hay movimientos guardados para este día.</p>
      </div>
    );
  }

  return (
    <div className="history-list">
      {logs.map((log) => {
        const method = String(log.payMethod || '').toUpperCase();
        const methodClass = method.includes('MP')
          ? 'history-method--mp'
          : 'history-method--cash';

        return (
          <article className="history-row" key={log.id}>
            <div className="history-row__main">
              <div className="history-row__plate">
                <strong>{log.occupantName || '—'}</strong>
                <span>
                  Plaza {log.spotId || '—'} · {log.vehicleType || '—'}
                </span>
              </div>

              <span className={`history-method ${methodClass}`}>
                {method || 'Sin método'}
              </span>
            </div>

            <div className="history-row__grid">
              <div>
                <span>Entrada</span>
                <strong>{formatTime(log.startTimestamp)}</strong>
              </div>

              <div>
                <span>Salida</span>
                <strong>{formatTime(log.endTimestamp)}</strong>
              </div>

              <div>
                <span>Tiempo</span>
                <strong>{formatDuration(log.startTimestamp, log.endTimestamp)}</strong>
              </div>

              <div>
                <span>Cobro</span>
                <strong>{formatMoney(log.amount)}</strong>
              </div>

              <div>
                <span>Abrió</span>
                <strong>{log.openedBy || log.occupantUser || '—'}</strong>
              </div>

              <div>
                <span>Cerró</span>
                <strong>{log.closedBy || '—'}</strong>
              </div>
            </div>

            <div className="history-row__actions">
              <button
                className="secondary-btn secondary-btn--small"
                type="button"
                onClick={() => onEdit(log)}
              >
                Editar registro
              </button>

              <button
                className="danger-btn secondary-btn--small"
                type="button"
                onClick={() => onDelete(log)}
              >
                Eliminar
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function DailyEditModal({ log, onClose, onSave }) {
  const [method, setMethod] = useState('EFECTIVO');
  const [amount, setAmount] = useState('');
  const [plate, setPlate] = useState('');

  useEffect(() => {
    if (log) {
      setMethod(String(log.payMethod || '').toUpperCase().includes('MP') ? 'MP' : 'EFECTIVO');
      setAmount(String(log.amount || ''));
      setPlate(log.occupantName || '');
    }
  }, [log]);

  if (!log) return null;

  return (
    <Modal open={!!log} onClose={onClose} labelledBy="dailyEditTitle">
      <div className="modal-title">
        <span>✏️</span>
        <h3 id="dailyEditTitle">Editar registro</h3>
      </div>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();

          onSave(log.id, {
            payMethod: method,
            amount: Number(amount),
            occupantName: plate.trim().toUpperCase(),
          });
        }}
      >
        <label className="form-field">
          <span>Patente</span>
          <input value={plate} onChange={(event) => setPlate(event.target.value)} required />
        </label>

        <label className="form-field">
          <span>Monto</span>
          <input
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            type="number"
            min="0.01"
            step="0.01"
            required
          />
        </label>

        <label className="form-field">
          <span>Método de pago</span>
          <select value={method} onChange={(event) => setMethod(event.target.value)} required>
            <option value="EFECTIVO">Efectivo</option>
            <option value="MP">MP</option>
          </select>
        </label>

        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>
            Cerrar
          </button>

          <button className="primary-btn" type="submit">
            Guardar
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DeleteLogModal({ log, onClose, onConfirm }) {
  if (!log) return null;

  return (
    <Modal open={!!log} onClose={onClose} labelledBy="deleteLogTitle">
      <div className="modal-title">
        <span>🗑️</span>
        <h3 id="deleteLogTitle">Eliminar registro</h3>
      </div>

      <p>
        ¿Estás seguro que querés eliminar el registro de{' '}
        <strong>{log.occupantName || 'este vehículo'}</strong>?
        Esta acción no se puede deshacer.
      </p>

      <div className="modal-actions">
        <button className="ghost-btn" type="button" onClick={onClose}>
          Cancelar
        </button>
        <button className="danger-btn" type="button" onClick={onConfirm}>
          Eliminar
        </button>
      </div>
    </Modal>
  );
}