import { useEffect, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Topbar from '../components/Topbar';
import { useToast } from '../components/Toast';
import { parkingLotLogsRef } from '../firebase/parkingLotRefs';
import { useAuth } from '../auth/AuthContext';
import {
  addDays,
  formatMoney,
  formatShortDate,
  parseDateInput,
  sanitizePdfText,
  toDateKey,
} from '../utils/helpers';

function toMillis(value) {
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

function logFromDoc(doc) {
  const data = doc.data() || {};

  return {
    id: doc.id,
    ...data,
    startTimestamp: toMillis(data.startTimestamp),
    endTimestamp: toMillis(data.endTimestamp),
  };
}

function getEmptyDayStats(date) {
  return {
    key: toDateKey(date),
    date: new Date(date),
    movements: 0,
    cash: 0,
    mp: 0,
    total: 0,
    auto: 0,
    camioneta: 0,
    moto: 0,
    otros: 0,
  };
}

function getRangeMillis(startDate, endDate) {
  // Medianoche Argentina (UTC-3) = 03:00 UTC
  const start = Date.UTC(
    startDate.getFullYear(), startDate.getMonth(), startDate.getDate(),
    3, 0, 0, 0
  );
  const end = Date.UTC(
    endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + 1,
    3, 0, 0, 0
  );
  return { start, end };
}

async function getLogsInRange(
  parkingLotId,
  startDate,
  endDate
) {

  if (!parkingLotId) {
  return [];
}
  const { start, end } = getRangeMillis(startDate, endDate);

  const snapshot = await parkingLotLogsRef(parkingLotId)
    .where('endTimestamp', '>=', start)
    .where('endTimestamp', '<', end)
    .get();

  return snapshot.docs
    .map(logFromDoc)
    .filter((log) => Boolean(log.endTimestamp))
    .sort((a, b) => (a.endTimestamp || 0) - (b.endTimestamp || 0));
}

async function buildReport(
  parkingLotId,
  startDate,
  endDate
){
  const days = [];
  const byDay = new Map();

  let cursor = new Date(startDate);

  while (toDateKey(cursor) <= toDateKey(endDate)) {
    const day = getEmptyDayStats(cursor);
    days.push(day);
    byDay.set(day.key, day);
    cursor = addDays(cursor, 1);
  }

 const logs = await getLogsInRange(
  parkingLotId,
  startDate,
  endDate
);

  const cashByUser = new Map();
  const vehicleTotals = {
    auto: 0,
    camioneta: 0,
    moto: 0,
    otros: 0,
  };

  let cash = 0;
  let mp = 0;

  logs.forEach((log) => {
    const day = byDay.get(toDateKey(log.endTimestamp));

    if (!day) return;

    const amount = Number(log.amount || 0);
    const method = String(log.payMethod || '').toUpperCase();
    const vehicle = String(log.vehicleType || '').toLowerCase();
    const closedBy = sanitizePdfText(log.closedBy || '—');

    day.movements += 1;
    day.total += amount;

    if (method.includes('MP')) {
      mp += amount;
      day.mp += amount;
    } else {
      cash += amount;
      day.cash += amount;
      cashByUser.set(closedBy, (cashByUser.get(closedBy) || 0) + amount);
    }

    if (vehicle.includes('moto')) {
      vehicleTotals.moto += 1;
      day.moto += 1;
    } else if (vehicle.includes('camioneta')) {
      vehicleTotals.camioneta += 1;
      day.camioneta += 1;
    } else if (vehicle.includes('auto')) {
      vehicleTotals.auto += 1;
      day.auto += 1;
    } else {
      vehicleTotals.otros += 1;
      day.otros += 1;
    }
  });

  const daysWithData = days.filter((day) => day.movements > 0);
  const total = cash + mp;

  const bestAmountDay = daysWithData.reduce(
    (best, day) => (!best || day.total >= best.total ? day : best),
    null
  );

  const bestCountDay = daysWithData.reduce(
    (best, day) => (!best || day.movements >= best.movements ? day : best),
    null
  );

  return {
    startDate,
    endDate,
    logs,
    days,
    daysWithData,
    cash,
    mp,
    total,
    movements: logs.length,
    avgVehicle: logs.length ? total / logs.length : 0,
    avgDay: daysWithData.length ? total / daysWithData.length : 0,
    bestAmountDay,
    bestCountDay,
    vehicleTotals,
    cashByUser: Array.from(cashByUser.entries()).sort((a, b) => b[1] - a[1]),
  };
}

function Kpi({ label, value, cls = '' }) {
  return (
    <article className={`cash-card ${cls}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

const RANGE_WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function getCalendarDays(monthDate) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1, 12);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const gridStart = addDays(firstDay, -mondayOffset);

  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function formatMonthLabel(date) {
  const label = date.toLocaleDateString('es-AR', {
    month: 'long',
    year: 'numeric',
  });

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function RangeDatePicker({ start, end, onStartChange, onEndChange }) {
  const pickerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [selectionStep, setSelectionStep] = useState('start');
  const [viewMonth, setViewMonth] = useState(() => {
    const initialDate = parseDateInput(start) || new Date();
    return new Date(initialDate.getFullYear(), initialDate.getMonth(), 1, 12);
  });

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!pickerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const days = getCalendarDays(viewMonth);
  const todayKey = toDateKey(new Date());

  function openPicker(step) {
    const selectedDate = parseDateInput(step === 'end' ? end : start)
      || parseDateInput(start)
      || new Date();

    setSelectionStep(step);
    setViewMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1, 12));
    setOpen(true);
  }

  function selectDay(date) {
    const dateKey = toDateKey(date);

    if (selectionStep === 'start') {
      onStartChange(dateKey);
      onEndChange('');
      setSelectionStep('end');
      return;
    }

    if (!start || dateKey < start) {
      onStartChange(dateKey);
      onEndChange('');
      setSelectionStep('end');
      return;
    }

    onEndChange(dateKey);
    setOpen(false);
  }

  function clearRange() {
    onStartChange('');
    onEndChange('');
    setSelectionStep('start');
  }

  return (
    <div className="monthly-range-picker" ref={pickerRef}>
      <div className="monthly-range-fields">
        <button
          className={`monthly-date-field${open && selectionStep === 'start' ? ' is-active' : ''}`}
          type="button"
          onClick={() => openPicker('start')}
          aria-expanded={open && selectionStep === 'start'}
        >
          <span>Desde</span>
          <strong>{start ? formatShortDate(parseDateInput(start)) : 'Elegir fecha'}</strong>
          <i aria-hidden="true">▣</i>
        </button>

        <button
          className={`monthly-date-field${open && selectionStep === 'end' ? ' is-active' : ''}`}
          type="button"
          onClick={() => openPicker('end')}
          aria-expanded={open && selectionStep === 'end'}
        >
          <span>Hasta</span>
          <strong>{end ? formatShortDate(parseDateInput(end)) : 'Elegir fecha'}</strong>
          <i aria-hidden="true">▣</i>
        </button>
      </div>

      {open ? (
        <section className="monthly-range-calendar" role="dialog" aria-label="Elegir rango de fechas">
          <header className="monthly-calendar-head">
            <button
              type="button"
              onClick={() => setViewMonth((current) => new Date(
                current.getFullYear(), current.getMonth() - 1, 1, 12
              ))}
              aria-label="Mes anterior"
            >
              ←
            </button>
            <strong>{formatMonthLabel(viewMonth)}</strong>
            <button
              type="button"
              onClick={() => setViewMonth((current) => new Date(
                current.getFullYear(), current.getMonth() + 1, 1, 12
              ))}
              aria-label="Mes siguiente"
            >
              →
            </button>
          </header>

          <div className="monthly-calendar-weekdays" aria-hidden="true">
            {RANGE_WEEKDAYS.map((weekday) => <span key={weekday}>{weekday}</span>)}
          </div>

          <div className="monthly-calendar-days">
            {days.map((date) => {
              const dateKey = toDateKey(date);
              const isOutside = date.getMonth() !== viewMonth.getMonth();
              const isStart = dateKey === start;
              const isEnd = dateKey === end;
              const isInRange = Boolean(start && end && dateKey > start && dateKey < end);
              const classes = [
                'monthly-calendar-day',
                isOutside ? 'is-outside' : '',
                dateKey === todayKey ? 'is-today' : '',
                isInRange ? 'is-in-range' : '',
                isStart || isEnd ? 'is-selected' : '',
              ].filter(Boolean).join(' ');

              return (
                <button
                  className={classes}
                  type="button"
                  key={dateKey}
                  onClick={() => selectDay(date)}
                  aria-label={formatShortDate(date)}
                  aria-pressed={isStart || isEnd}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <footer className="monthly-calendar-footer">
            <span>
              {selectionStep === 'start' ? 'Elegí la fecha inicial' : 'Ahora elegí la fecha final'}
            </span>
            <div>
              <button type="button" onClick={clearRange}>Limpiar</button>
              <button type="button" onClick={() => selectDay(new Date())}>Hoy</button>
            </div>
          </footer>
        </section>
      ) : null}
    </div>
  );
}

export default function MonthlyReportPage() {
  const { showToast } = useToast();
  const { parkingLotId } = useAuth();

  const now = new Date();

  const [start, setStart] = useState(
    toDateKey(new Date(now.getFullYear(), now.getMonth(), 1))
  );

  const [end, setEnd] = useState(toDateKey(now));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  function validateRange() {
    const startDate = parseDateInput(start);
    const endDate = parseDateInput(end);

    if (!startDate || !endDate) {
      showToast('Elegí fecha desde y fecha hasta.');
      return null;
    }

    if (toDateKey(endDate) < toDateKey(startDate)) {
      showToast('La fecha hasta no puede ser anterior a la fecha desde.');
      return null;
    }

    return {
      startDate,
      endDate,
    };
  }

  async function generatePreview(event) {
    event.preventDefault();

    const range = validateRange();
    if (!range) return;

    try {
      setLoading(true);
      const nextReport = await buildReport(
        parkingLotId,
        range.startDate,
        range.endDate
      );
      setReport(nextReport);

      if (!nextReport.movements) {
        showToast('No hay movimientos en el rango seleccionado.');
      } else {
        showToast('Vista previa generada.');
      }
    } catch (error) {
      console.error('Error generando reporte mensual:', error);
      showToast('No se pudo generar el reporte mensual. Revisá permisos o conexión.');
    } finally {
      setLoading(false);
    }
  }

  function exportPdf() {
    if (!report) return;

    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Estacionamiento Azul - Reporte mensual', 14, 18);

    doc.setFontSize(11);
    doc.text(
      `${formatShortDate(report.startDate)} al ${formatShortDate(report.endDate)}`,
      14,
      27
    );

    doc.text(
      `Total: ${formatMoney(report.total)} | Efectivo: ${formatMoney(report.cash)} | MP: ${formatMoney(report.mp)} | Movimientos: ${report.movements}`,
      14,
      36
    );

    autoTable(doc, {
      startY: 45,
      head: [['Fecha', 'Mov.', 'Efectivo', 'MP', 'Total', 'Vehículos']],
      body: report.daysWithData.map((day) => [
        formatShortDate(day.date),
        String(day.movements),
        formatMoney(day.cash),
        formatMoney(day.mp),
        formatMoney(day.total),
        `A:${day.auto} C:${day.camioneta} M:${day.moto}`,
      ]),
    });

    doc.save(
      `reporte-mensual-${toDateKey(report.startDate)}-${toDateKey(report.endDate)}.pdf`
    );
  }

  const rows = report
    ? report.daysWithData.length
      ? report.daysWithData
      : report.days
    : [];

  return (
    <>
      <Topbar
        title="PDF mensual"
        links={[
          {
            to: '/admin',
            label: 'Panel admin',
          },
          {
            to: '/daily-report',
            label: 'Historial por día',
          },
          {
            to: '/',
            label: 'Panel principal',
          },
        ]}
      />

      <main className="layout monthly-report-layout">
        <section className="page-title monthly-report-hero">
          <p className="eyebrow">Reporte mensual</p>
          <h2>Estadísticas por rango de días</h2>
          <p className="muted">
            Elegí una fecha desde y hasta. El PDF se genera con los movimientos guardados
            en Firestore.
          </p>
        </section>

        <section className="admin-card monthly-filter-card">
          <div className="section-head">
            <div>
              <h3>Rango del reporte</h3>
              <p className="muted">
                Incluye todos los registros cerrados entre las fechas seleccionadas.
              </p>
            </div>
          </div>

          <form className="monthly-range-form" onSubmit={generatePreview}>
            <RangeDatePicker
              start={start}
              end={end}
              onStartChange={setStart}
              onEndChange={setEnd}
            />

            <div className="monthly-range-actions">
              <button className="primary-btn" type="submit" disabled={loading}>
                {loading ? 'Generando...' : 'Generar vista previa'}
              </button>

              <button
                className="secondary-btn"
                type="button"
                disabled={!report || report.movements === 0 || loading}
                onClick={exportPdf}
              >
                Exportar PDF mensual
              </button>
            </div>
          </form>
        </section>

        {report ? (
          <section className="monthly-preview">
            <section className="admin-card">
              <div className="section-head">
                <div>
                  <h3>Resumen del rango</h3>
                  <p className="muted">
                    {formatShortDate(report.startDate)} al {formatShortDate(report.endDate)}
                    {' · '}
                    {report.daysWithData.length} día
                    {report.daysWithData.length === 1 ? '' : 's'} con movimientos.
                  </p>
                </div>
              </div>

              <div className="monthly-kpi-grid">
                <Kpi
                  cls="cash-card--total"
                  label="Total cobrado"
                  value={formatMoney(report.total)}
                />

                <Kpi
                  cls="cash-card--cash"
                  label="Efectivo"
                  value={formatMoney(report.cash)}
                />

                <Kpi
                  cls="cash-card--mp"
                  label="MP"
                  value={formatMoney(report.mp)}
                />

                <Kpi label="Movimientos" value={report.movements} />

                <Kpi
                  label="Promedio por vehículo"
                  value={formatMoney(report.avgVehicle)}
                />

                <Kpi
                  label="Promedio por día con datos"
                  value={formatMoney(report.avgDay)}
                />
              </div>
            </section>

            <section className="monthly-detail-grid">
              <article className="admin-card">
                <h3>Mejores días</h3>

                <div className="best-days-grid">
                  <div>
                    <span>Mayor recaudación</span>
                    <strong>
                      {report.bestAmountDay
                        ? formatShortDate(report.bestAmountDay.date)
                        : '—'}
                    </strong>
                    <small>
                      {report.bestAmountDay
                        ? formatMoney(report.bestAmountDay.total)
                        : '—'}
                    </small>
                  </div>

                  <div>
                    <span>Más movimientos</span>
                    <strong>
                      {report.bestCountDay
                        ? formatShortDate(report.bestCountDay.date)
                        : '—'}
                    </strong>
                    <small>
                      {report.bestCountDay
                        ? `${report.bestCountDay.movements} movimientos`
                        : '—'}
                    </small>
                  </div>
                </div>
              </article>

              <article className="admin-card">
                <h3>Vehículos</h3>

                <div className="vehicle-summary-grid">
                  <div>
                    <span>Autos</span>
                    <strong>{report.vehicleTotals.auto}</strong>
                  </div>

                  <div>
                    <span>Camionetas</span>
                    <strong>{report.vehicleTotals.camioneta}</strong>
                  </div>

                  <div>
                    <span>Motos</span>
                    <strong>{report.vehicleTotals.moto}</strong>
                  </div>

                  <div>
                    <span>Otros</span>
                    <strong>{report.vehicleTotals.otros}</strong>
                  </div>
                </div>
              </article>
            </section>

            <section className="admin-card monthly-table-card">
              <div className="section-head">
                <div>
                  <h3>Resumen día por día</h3>
                  <p className="muted">Estos datos son los que alimentan el PDF mensual.</p>
                </div>
              </div>

              <div className="monthly-daily-table">
                {!report.movements ? (
                  <p className="empty-state">
                    No hay movimientos guardados en el rango seleccionado.
                  </p>
                ) : (
                  <>
                    <div className="monthly-table monthly-table--head">
                      <span>Fecha</span>
                      <span>Mov.</span>
                      <span>Efectivo</span>
                      <span>MP</span>
                      <span>Total</span>
                      <span>Vehículos</span>
                    </div>

                    {rows.map((day) => (
                      <div className="monthly-table" key={day.key}>
                        <strong>{formatShortDate(day.date)}</strong>
                        <span>{day.movements}</span>
                        <span>{formatMoney(day.cash)}</span>
                        <span>{formatMoney(day.mp)}</span>
                        <strong>{formatMoney(day.total)}</strong>
                        <span>
                          A:{day.auto} C:{day.camioneta} M:{day.moto}
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </section>
          </section>
        ) : null}
      </main>
    </>
  );
}
