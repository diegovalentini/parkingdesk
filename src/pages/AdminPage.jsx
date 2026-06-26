import { useEffect, useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { db, firebase } from '../firebase/firebase';
import {
  formatDate,
  formatMoney,
  LOGS_COLLECTION,
  SETTINGS_DOC,
  SPOTS_COLLECTION,
  todayRange,
} from '../utils/helpers';
import {
  addBlacklistEntry,
  deleteBlacklistEntry,
  listenBlacklist,
  setBlacklistActive,
} from '../utils/blacklistService';

function desiredSpotIds(autoCount, motoCount) {
  const ids = [];

  for (let i = 1; i <= motoCount; i += 1) {
    ids.push(`M${i}`);
  }

  for (let i = 1; i <= autoCount; i += 1) {
    ids.push(String(i));
  }

  return ids;
}

function defaultSpotData(id) {
  const isMoto = String(id).startsWith('M');

  return {
    id,
    type: isMoto ? 'moto' : 'auto',
    occupied: false,
    blocked: false,
    occupantName: null,
    plateNormalized: null,
    startTimestamp: null,
    vehicleType: isMoto ? 'Moto' : null,
    openedBy: null,
    openedByUid: null,
    hasKey: false,
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
}

function AdminMobileCollapse({ id, title, open, onToggle, children }) {
  return (
    <div className={`admin-mobile-collapse ${open ? 'is-open' : ''}`}>
      <button
        className="admin-mobile-collapse__toggle"
        type="button"
        onClick={() => onToggle(id)}
      >
        <span>{title}</span>
        <strong>{open ? '−' : '+'}</strong>
      </button>

      <div className="admin-mobile-collapse__body">
        {children}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [users, setUsers] = useState([]);
  const [cashLogs, setCashLogs] = useState([]);
  const [autoCount, setAutoCount] = useState(30);
  const [motoCount, setMotoCount] = useState(5);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [blacklistEntries, setBlacklistEntries] = useState([]);
  const [blacklistLoading, setBlacklistLoading] = useState(true);

  const [mobileSections, setMobileSections] = useState({
    cash: true,
    config: false,
    users: false,
    blacklist: false,
    reports: false,
  });

  function toggleMobileSection(key) {
    setMobileSections((current) => ({
      ...current,
      [key]: !current[key],
    }));
  }

  useEffect(() => {
    setBlacklistLoading(true);

    const unsubscribe = listenBlacklist(
      (entries) => {
        setBlacklistEntries(entries);
        setBlacklistLoading(false);
      },
      (error) => {
        console.error('Error leyendo Black List:', error);
        showToast('No se pudo cargar la Black List.');
        setBlacklistLoading(false);
      }
    );

    return () => unsubscribe();
  }, [showToast]);

  useEffect(() => {
    const unsubscribe = db.collection('users').onSnapshot(
      (snapshot) => {
        const activeUsers = snapshot.docs
          .map((doc) => ({
            uid: doc.id,
            ...doc.data(),
          }))
          .filter((item) => item.active !== false)
          .sort((a, b) =>
            String(a.username || '').localeCompare(String(b.username || ''))
          );

        setUsers(activeUsers);
      },
      (error) => {
        console.error(error);
        showToast('No se pudieron cargar los usuarios. Revisá las reglas de Firestore.');
      }
    );

    return () => unsubscribe();
  }, [showToast]);

  useEffect(() => {
    const { start, end } = todayRange();

    const unsubscribe = db
      .collection(LOGS_COLLECTION)
      .where('endTimestamp', '>=', start)
      .where('endTimestamp', '<', end)
      .onSnapshot(
        (snapshot) => {
          setCashLogs(snapshot.docs.map((doc) => doc.data() || {}));
        },
        (error) => {
          console.error('Error leyendo caja del día:', error);
          showToast('No se pudo leer la caja del día.');
        }
      );

    return () => unsubscribe();
  }, [showToast]);

  async function loadSpotSettings() {
    try {
      const settingsSnap = await db.doc(SETTINGS_DOC).get();

      if (settingsSnap.exists) {
        const data = settingsSnap.data() || {};
        setAutoCount(Number(data.autoCount ?? 30));
        setMotoCount(Number(data.motoCount ?? 5));
        return;
      }

      const qs = await db.collection(SPOTS_COLLECTION).get();

      let auto = 0;
      let moto = 0;

      qs.docs.forEach((doc) => {
        const data = doc.data() || {};
        const id = String(data.id || doc.id);

        if ((data.type || '').toLowerCase() === 'moto' || id.startsWith('M')) {
          moto += 1;
        } else {
          auto += 1;
        }
      });

      setAutoCount(auto || 30);
      setMotoCount(moto || 5);
    } catch (error) {
      console.error(error);
      setAutoCount(30);
      setMotoCount(5);
    }
  }

  useEffect(() => {
    loadSpotSettings();
  }, []);

  const summary = useMemo(() => {
    let cash = 0;
    let mp = 0;

    cashLogs.forEach((log) => {
      const amount = Number(log.amount || 0);
      const method = String(log.payMethod || '').toUpperCase();

      if (method.includes('MP')) {
        mp += amount;
      } else {
        cash += amount;
      }
    });

    return {
      movements: cashLogs.length,
      cash,
      mp,
      total: cash + mp,
    };
  }, [cashLogs]);

  const blacklistSummary = useMemo(() => {
    const entries = [...blacklistEntries].sort((a, b) => {
      const aCreated = typeof a.createdAt?.toMillis === 'function'
        ? a.createdAt.toMillis()
        : Number(a.createdAt || 0);

      const bCreated = typeof b.createdAt?.toMillis === 'function'
        ? b.createdAt.toMillis()
        : Number(b.createdAt || 0);

      return bCreated - aCreated;
    });

    const active = entries.filter((item) => item.active !== false).length;

    return {
      entries,
      active,
    };
  }, [blacklistEntries]);

  async function applySpotConfiguration(event) {
    event.preventDefault();

    const auto = Number(autoCount);
    const moto = Number(motoCount);

    if (auto < 0 || moto < 0) {
      showToast('Las cantidades no pueden ser negativas.');
      return;
    }

    try {
      const ids = desiredSpotIds(auto, moto);
      const desired = new Set(ids);

      const snapshot = await db.collection(SPOTS_COLLECTION).get();
      const existing = new Map(
        snapshot.docs.map((doc) => [doc.id, doc.data() || {}])
      );

      const toDelete = snapshot.docs.filter((doc) => !desired.has(doc.id));
      const riskyDelete = toDelete.filter(
        (doc) => doc.data()?.occupied === true || doc.data()?.blocked === true
      );

      if (riskyDelete.length) {
        const list = riskyDelete.map((doc) => doc.id).join(', ');
        const ok = window.confirm(
          `Vas a eliminar plazas ocupadas o bloqueadas: ${list}. ¿Confirmás el cambio?`
        );

        if (!ok) return;
      }

      const batch = db.batch();

      ids.forEach((id) => {
        const ref = db.collection(SPOTS_COLLECTION).doc(id);

        if (!existing.has(id)) {
          batch.set(ref, defaultSpotData(id));
          return;
        }

        const isMoto = id.startsWith('M');
        const current = existing.get(id);

        batch.set(
          ref,
          {
            id,
            type: isMoto ? 'moto' : 'auto',
            vehicleType: current.occupied
              ? current.vehicleType || (isMoto ? 'Moto' : null)
              : isMoto
                ? 'Moto'
                : null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      toDelete.forEach((doc) => {
        batch.delete(doc.ref);
      });

      batch.set(
        db.doc(SETTINGS_DOC),
        {
          autoCount: auto,
          motoCount: moto,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedBy: user.username || user.email || 'Admin',
          updatedByUid: user.uid,
        },
        { merge: true }
      );

      await batch.commit();

      showToast('Configuración de plazas aplicada.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo aplicar la configuración de plazas.');
    }
  }

  async function updateRole(uid, role) {
    try {
      await db.collection('users').doc(uid).set(
        {
          role,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedByUid: user.uid,
        },
        { merge: true }
      );

      showToast('Rol actualizado.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo actualizar el rol.');
    }
  }

  async function deleteUser(uid) {
    if (uid === user.uid) {
      showToast('No podés eliminar el usuario con el que estás logueado.');
      return;
    }

    const ok = window.confirm('¿Desactivar este usuario?');
    if (!ok) return;

    try {
      await db.collection('users').doc(uid).set(
        {
          active: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
          disabledByUid: user.uid,
        },
        { merge: true }
      );

      showToast('Usuario desactivado.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo desactivar el usuario.');
    }
  }

  async function addBlacklist(event) {
    event.preventDefault();

    const formElement = event.currentTarget;
    const form = new FormData(formElement);

    const plate = String(form.get('plate') || '').trim().toUpperCase();
    const reason = String(form.get('reason') || '').trim();
    const notes = String(form.get('notes') || '').trim();

    if (!plate || !reason) {
      showToast('Ingresá patente y motivo.');
      return;
    }

    try {
      await addBlacklistEntry({
        plate,
        reason,
        notes,
        user,
      });

      formElement.reset();
      showToast('Patente agregada a Black List.');
    } catch (error) {
      console.error(error);
      showToast(error.message || 'No se pudo agregar la patente.');
    }
  }

  async function toggleBlacklist(item) {
    try {
      await setBlacklistActive(
        item.plateNormalized || item.id,
        item.active === false,
        user
      );

      showToast(item.active === false ? 'Patente activada.' : 'Patente desactivada.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo actualizar la patente.');
    }
  }

  async function deleteBlacklist(item) {
    const ok = window.confirm('¿Eliminar esta patente de la Black List?');
    if (!ok) return;

    try {
      await deleteBlacklistEntry(item.plateNormalized || item.id);
      showToast('Patente eliminada de Black List.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo eliminar la patente.');
    }
  }

  return (
    <>
      <Topbar
        title="Panel Admin"
        links={[
          {
            to: '/',
            label: 'Panel principal',
          },
        ]}
      />

      <main className="layout admin-layout">
        <section className="page-title admin-title admin-title--compact">
          <h2>Panel de control</h2>
        </section>

        <section className="admin-card admin-card--cash">
          <AdminMobileCollapse
            id="cash"
            title="Resumen de caja"
            open={mobileSections.cash}
            onToggle={toggleMobileSection}
          >
            <div className="section-head">
              <div>
                <h3>Resumen de caja del día</h3>
                <p className="muted">
                  Solo visible para administradores. Se calcula con los movimientos cerrados hoy.
                </p>
              </div>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => {
                  loadSpotSettings();
                  showToast('Panel actualizado.');
                }}
              >
                Actualizar
              </button>
            </div>

            <div className="cash-grid" aria-label="Resumen de caja">
              <article className="cash-card">
                <span>Movimientos</span>
                <strong>{summary.movements}</strong>
              </article>

              <article className="cash-card cash-card--cash">
                <span>Efectivo hoy</span>
                <strong>{formatMoney(summary.cash)}</strong>
              </article>

              <article className="cash-card cash-card--mp">
                <span>MP hoy</span>
                <strong>{formatMoney(summary.mp)}</strong>
              </article>

              <article className="cash-card cash-card--total">
                <span>Total hoy</span>
                <strong>{formatMoney(summary.total)}</strong>
              </article>
            </div>
          </AdminMobileCollapse>
        </section>

        <section className="admin-grid admin-grid--balanced">
          <article className="admin-card admin-card--highlight">
            <AdminMobileCollapse
              id="config"
              title="Configurar plazas"
              open={mobileSections.config}
              onToggle={toggleMobileSection}
            >
              <div className="section-head">
                <div>
                  <h3>Configurar plazas</h3>
                  <p className="muted">
                    Definí cuántas plazas querés de autos y motos. Las motos se muestran primero:
                    M1, M2, M3...
                  </p>
                </div>
              </div>

              <form className="config-form" onSubmit={applySpotConfiguration}>
                <label className="form-field">
                  <span>Plazas de autos</span>
                  <input
                    value={autoCount}
                    onChange={(event) => setAutoCount(event.target.value)}
                    type="number"
                    min="0"
                    max="300"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Plazas de motos</span>
                  <input
                    value={motoCount}
                    onChange={(event) => setMotoCount(event.target.value)}
                    type="number"
                    min="0"
                    max="100"
                    required
                  />
                </label>

                <button className="primary-btn" type="submit">
                  Aplicar cambios
                </button>
              </form>

              <p className="demo-note">
                Los cambios se aplican al panel principal. Si bajás la cantidad, se pedirá
                confirmación antes de quitar plazas con datos.
              </p>
            </AdminMobileCollapse>
          </article>

          <article className="admin-card">
            <AdminMobileCollapse
              id="users"
              title="Usuarios registrados"
              open={mobileSections.users}
              onToggle={toggleMobileSection}
            >
              <div className="section-head">
                <div>
                  <h3>Usuarios registrados</h3>
                  <p className="muted">
                    Los usuarios se crean desde registro. Desde acá modificamos roles o eliminamos
                    cuentas.
                  </p>
                </div>
              </div>

              <div className="users-table">
                {!users.length ? (
                  <p className="muted">No hay usuarios registrados.</p>
                ) : (
                  users.map((item) => (
                    <div className="user-row" key={item.uid}>
                      <div>
                        <strong>{item.username || 'Usuario'}</strong>
                      </div>

                      <span className={`role-pill role-pill--${item.role || 'viewer'}`}>
                        {String(item.role || 'viewer').toUpperCase()}
                      </span>

                      <span className="muted small-text">
                        {formatDate(item.createdAt)}
                      </span>

                      <select
                        className="role-select"
                        value={item.role || 'viewer'}
                        onChange={(event) => updateRole(item.uid, event.target.value)}
                        disabled={item.uid === user.uid}
                      >
                        <option value="viewer">Viewer</option>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                      </select>

                      <button
                        className="danger-btn danger-btn--small"
                        type="button"
                        onClick={() => deleteUser(item.uid)}
                        disabled={item.uid === user.uid}
                      >
                        Eliminar
                      </button>
                    </div>
                  ))
                )}
              </div>
            </AdminMobileCollapse>
          </article>
        </section>

        <section className="admin-grid admin-grid--wide-left admin-grid--bottom">
          <article className="admin-card blacklist-card">
            <AdminMobileCollapse
              id="blacklist"
              title="Black List"
              open={mobileSections.blacklist}
              onToggle={toggleMobileSection}
            >
              <div className="section-head">
                <div>
                  <h3>Black List</h3>
                  <p className="muted">
                    Agregá patentes con motivo. Al ocupar una plaza, la app mostrará una advertencia
                    si la patente está activa.
                  </p>
                </div>
              </div>

              <form className="blacklist-form" onSubmit={addBlacklist}>
                <label className="form-field">
                  <span>Patente</span>
                  <input
                    name="plate"
                    type="text"
                    placeholder="Ej: AB123CD"
                    autoComplete="off"
                    required
                  />
                </label>

                <label className="form-field">
                  <span>Motivo</span>
                  <input
                    name="reason"
                    type="text"
                    placeholder="Ej: Se fue sin pagar"
                    required
                  />
                </label>

                <label className="form-field form-field--full">
                  <span>Notas</span>
                  <textarea
                    name="notes"
                    rows="3"
                    placeholder="Detalle opcional"
                  />
                </label>

                <button className="primary-btn" type="submit">
                  Agregar a Black List
                </button>
              </form>

              <div className="blacklist-history-head">
                <div>
                  <strong>Historial de Black List</strong>
                  <p className="muted small-text">
                    {blacklistLoading
                      ? 'Cargando Black List...'
                      : blacklistSummary.entries.length
                        ? `${blacklistSummary.entries.length} registro${
                            blacklistSummary.entries.length === 1 ? '' : 's'
                          } · ${blacklistSummary.active} activa${
                            blacklistSummary.active === 1 ? '' : 's'
                          }`
                        : 'Sin registros.'}
                  </p>
                </div>

                <button
                  className="secondary-btn secondary-btn--small"
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                >
                  {historyOpen ? 'Ocultar historial' : 'Ver historial'}
                </button>
              </div>

              <div className={`blacklist-history-panel ${historyOpen ? '' : 'is-hidden'}`}>
                <div className="blacklist-table">
                  {blacklistLoading ? (
                    <p className="muted">Cargando Black List...</p>
                  ) : !blacklistSummary.entries.length ? (
                    <p className="muted">No hay patentes en Black List.</p>
                  ) : (
                    blacklistSummary.entries.map((item) => (
                      <div
                        className="blacklist-item"
                        key={item.plateNormalized || item.id}
                      >
                        <div className="blacklist-item__top">
                          <strong>{item.plate || item.id}</strong>

                          <span
                            className={`role-pill ${
                              item.active === false
                                ? 'role-pill--viewer'
                                : 'role-pill--admin'
                            }`}
                          >
                            {item.active === false ? 'INACTIVA' : 'ACTIVA'}
                          </span>
                        </div>

                        <p>
                          <strong>Motivo:</strong> {item.reason || '—'}
                        </p>

                        <p>
                          <strong>Notas:</strong> {item.notes || '—'}
                        </p>

                        <p className="muted small-text">
                          Creada por {item.createdBy || 'Admin'} · {formatDate(item.createdAt)}
                        </p>

                        <div className="mini-actions">
                          <button
                            className="secondary-btn secondary-btn--small"
                            type="button"
                            onClick={() => toggleBlacklist(item)}
                          >
                            {item.active === false ? 'Activar' : 'Desactivar'}
                          </button>

                          <button
                            className="danger-btn danger-btn--small"
                            type="button"
                            onClick={() => deleteBlacklist(item)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </AdminMobileCollapse>
          </article>

          <article className="admin-card reports-card">
            <AdminMobileCollapse
              id="reports"
              title="Reportes"
              open={mobileSections.reports}
              onToggle={toggleMobileSection}
            >
              <div className="section-head">
                <div>
                  <h3>Reportes</h3>
                  <p className="muted">
                    Historial por día permite consultar, editar y exportar el PDF diario. PDF mensual
                    genera estadísticas por rango de fechas.
                  </p>
                </div>
              </div>

              <div className="report-actions">
                <a className="secondary-btn report-link" href="/daily-report">
                  Historial por día
                </a>

                <a className="secondary-btn report-link" href="/monthly-report">
                  PDF mensual
                </a>
              </div>
            </AdminMobileCollapse>
          </article>
        </section>
      </main>
    </>
  );
}