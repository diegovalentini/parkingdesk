import { useEffect, useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { db, firebase } from '../firebase/firebase';
import { formatDuration, formatMoney, formatTime, LOGS_COLLECTION, logFromDoc, normalizeText, todayRange } from '../utils/helpers';

export default function HistoryPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  useEffect(() => {
    const { start, end } = todayRange();
    const unsub = db.collection(LOGS_COLLECTION).where('endTimestamp', '>=', start).where('endTimestamp', '<', end).onSnapshot((snapshot) => {
      setLogs(snapshot.docs.map(logFromDoc).sort((a, b) => (b.endTimestamp || 0) - (a.endTimestamp || 0)));
    }, (error) => {
      console.error('Error leyendo historial:', error);
      showToast('No se pudo cargar el historial. Revisá las reglas de Firestore.');
    });
    return () => unsub();
  }, [showToast]);

  const filteredLogs = useMemo(() => {
    const q = normalizeText(search);
    if (!q) return logs;
    return logs.filter((log) => [log.occupantName, log.closedBy].map(normalizeText).join('').includes(q));
  }, [logs, search]);

  async function saveLog(logId, changes) {
    try {
      await db.collection(LOGS_COLLECTION).doc(logId).set({
        ...changes,
        editedBy: user?.username || user?.email || 'Usuario',
        editedByUid: user?.uid || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
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

  const links = [{ to: '/', label: 'Panel principal' }];
  if (user?.role === 'admin') links.push({ to: '/admin', label: 'Admin' });

  return <>
    <Topbar title="Estacionamiento Azul" links={links} />
    <main className="layout history-layout">
      <section className="hero-card history-hero">
        <div>
          <p className="eyebrow">Historial diario</p>
          <h2>Movimientos de hoy</h2>
      <p className="muted">Los usuarios pueden consultar el historial y corregir el método de pago cuando haga falta.</p>
      </div>
      <button className="secondary-btn" type="button" onClick={() => showToast('Historial actualizado.')}>Actualizar</button>
      </section>
      <section className="history-toolbar">
        <label className="search-box">
        <span>Buscar por patente o usuario que cerró</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} type="search" placeholder="Ej: AB123CD o Diego" autoComplete="off" />
        </label>
        </section>
      <section className="history-card">
        <div className="section-head">
        <div>
        <h3>Registros cerrados hoy</h3><p className="muted">Movimientos cerrados del día actual.</p>
        </div>
        </div>
        <div className="history-list" aria-live="polite">
      <HistoryRows logs={filteredLogs} user={user} search={search} onEdit={setEditing} onDelete={askDeleteLog} />
      </div>
      </section>
    </main>
    <EditHistoryModal log={editing} onClose={() => setEditing(null)} onSave={saveLog} admin={user?.role === 'admin'} />
      <DeleteLogModal
  log={deleteTarget}
  onClose={() => setDeleteTarget(null)}
  onConfirm={confirmDeleteLog}
/>
  </>;
}

function HistoryRows({ logs, user, search, onEdit, onDelete }) {
  if (!logs.length) return <p className="empty-state">No hay movimientos para mostrar{search ? ' con esa búsqueda' : ''}.</p>;
  return logs.map((log) => {
    const method = String(log.payMethod || '').toUpperCase();
    const methodClass = method.includes('MP') ? 'history-method--mp' : 'history-method--cash';
    return <article className="history-row" key={log.id}><div className="history-row__main">
      <div className="history-row__plate">
        <strong>{log.occupantName || '—'}</strong>
        <span>Plaza {log.spotId || '—'} · {log.vehicleType || '—'}</span>
        </div>
        <span className={`history-method ${methodClass}`}>{method || 'Sin método'}</span>
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
                    <strong>{log.openedBy || '—'}</strong>
                    </div>
                    <div>
                      <span>Cerró</span>
                      <strong>{log.closedBy || '—'}</strong>
                      </div>
                      </div>
                      <div className="history-row__actions">
                        <button className="secondary-btn secondary-btn--small" type="button" onClick={() => onEdit({ ...log, mode: 'method' })}>Cambiar método</button>
                        {user?.role === 'admin' ?
                        <button className="ghost-btn secondary-btn--small" type="button" onClick={() => onEdit({ ...log, mode: 'admin' })}>Editar registro</button>
                         : null}{user?.role === 'admin' ? 
                         <button className="danger-btn secondary-btn--small" type="button" onClick={() => onDelete(log)}>Eliminar</button> 
                         : null}</div></article>;
  });
}

function EditHistoryModal({ log, onClose, onSave, admin }) {
  const [method, setMethod] = useState('EFECTIVO');
  const [amount, setAmount] = useState('');
  const [plate, setPlate] = useState('');

  useEffect(() => {
        if (!log) return;
    setMethod(String(log.payMethod || '').toUpperCase().includes('MP') ? 'MP' : 'EFECTIVO');
    setAmount(String(log.amount || ''));
    setPlate(log.occupantName || '');
  }, [log]);

  if (!log) return null;
  const fullEdit = admin && log.mode === 'admin';
  return <Modal open={!!log} onClose={onClose} labelledBy="editLogTitle"><div className="modal-title"><span>💳</span><h3 id="editLogTitle">{fullEdit ? 'Editar registro' : 'Cambiar método'}</h3></div><div className="detail-list"><div className="detail-row"><span>Patente</span><strong>{log.occupantName || '—'}</strong></div><div className="detail-row"><span>Plaza</span><strong>{log.spotId || '—'}</strong></div><div className="detail-row"><span>Monto</span><strong>{formatMoney(log.amount)}</strong></div></div><form className="form-grid" onSubmit={(event) => { event.preventDefault(); const changes = fullEdit ? { payMethod: method, amount: Number(amount), occupantName: plate.trim().toUpperCase() } : { payMethod: method }; onSave(log.id, changes); }}>
    {fullEdit ? <><label className="form-field"><span>Patente</span><input value={plate} onChange={(e) => setPlate(e.target.value)} required /></label><label className="form-field"><span>Monto</span><input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" required /></label></> : null}
    <label className="form-field"><span>Método de pago</span><select value={method} onChange={(e) => setMethod(e.target.value)} required><option value="EFECTIVO">Efectivo</option><option value="MP">MP</option></select></label><div className="modal-actions"><button className="ghost-btn" type="button" onClick={onClose}>Cerrar</button><button className="primary-btn" type="submit">Guardar</button></div></form></Modal>;
}

function DeleteLogModal({ log, onClose, onConfirm }) {
  if (!log) return null;

  return (
    <Modal open={!!log} onClose={onClose} labelledBy="deleteLogTitle">
      <div className="modal-title">
        <span>🗑️</span>
        <h3 id="deleteLogTitle">Eliminar registro</h3>
      </div>

      <div className="detail-list">
        <div className="detail-row">
          <span>Patente</span>
          <strong>{log.occupantName || '—'}</strong>
        </div>

        <div className="detail-row">
          <span>Plaza</span>
          <strong>{log.spotId || '—'}</strong>
        </div>

        <div className="detail-row">
          <span>Cobro</span>
          <strong>{formatMoney(log.amount)}</strong>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14 }}>
        Esta acción elimina el registro del historial. No modifica el estado actual de la plaza.
      </p>

      <div className="modal-actions">
        <button className="ghost-btn" type="button" onClick={onClose}>
          Cancelar
        </button>

        <button className="danger-btn" type="button" onClick={onConfirm}>
          Eliminar registro
        </button>
      </div>
    </Modal>
  );
}