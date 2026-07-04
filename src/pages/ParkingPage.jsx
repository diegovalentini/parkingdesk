import { useEffect, useMemo, useState } from 'react';
import Topbar from '../components/Topbar';
import Modal from '../components/Modal';
import { useAuth } from '../auth/AuthContext';
import { useToast } from '../components/Toast';
import { db, firebase } from '../firebase/firebase';
import {
  formatDateTime,
  formatDuration,
  formatMoney,
  LOGS_COLLECTION,
  normalizePlate,
  sortSpots,
  SPOTS_COLLECTION,
  spotFromDoc,
} from '../utils/helpers';
import { getActiveBlacklistEntry } from '../utils/blacklistService';

function getSpotStatus(spot) {
  if (spot.blocked) return 'blocked';
  if (spot.occupied) return 'occupied';
  return 'free';
}

function getStatusLabel(spot) {
  const status = getSpotStatus(spot);

  if (status === 'blocked') return 'Bloqueada';
  if (status === 'occupied') return 'Ocupada';

  return 'Libre';
}

export default function ParkingPage() {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [spots, setSpots] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedSpot, setSelectedSpot] = useState(null);
  const [moveTarget, setMoveTarget] = useState(null);

  useEffect(() => {
    const unsubscribe = db.collection(SPOTS_COLLECTION).onSnapshot(
      (snapshot) => {
        setSpots(sortSpots(snapshot.docs.map(spotFromDoc)));
      },
      (error) => {
        console.error('Error leyendo plazas:', error);
        showToast('No se pudieron cargar las plazas. Revisá las reglas de Firestore.');
      }
    );

    return () => unsubscribe();
  }, [showToast]);

  const visibleSpots = useMemo(() => {
    const q = normalizePlate(search);

    if (!q) return spots;

    return spots.filter((spot) => {
      const id = normalizePlate(spot.id);
      const plate = normalizePlate(spot.occupantName);
      const type = normalizePlate(spot.vehicleType || spot.type);

      return id.includes(q) || plate.includes(q) || type.includes(q);
    });
  }, [search, spots]);

  const canOperate = user && ['user', 'admin'].includes(user.role);
  const isAdmin = user?.role === 'admin';

  async function occupySpot(spotId, plate, vehicleType) {
    const displayPlate = String(plate || '').trim().toUpperCase();
    const normalized = normalizePlate(displayPlate);

    if (!normalized) {
      showToast('Ingresá una patente válida.');
      return;
    }

    try {
      const duplicates = await db
        .collection(SPOTS_COLLECTION)
        .where('occupied', '==', true)
        .where('plateNormalized', '==', normalized)
        .limit(1)
        .get();

      if (!duplicates.empty && duplicates.docs[0].id !== spotId) {
        const data = duplicates.docs[0].data();

        showToast(
          `La patente ${displayPlate} ya está ocupando la plaza ${data.id || duplicates.docs[0].id}.`
        );

        return;
      }

      const blacklistEntry = await getActiveBlacklistEntry(displayPlate);

      if (blacklistEntry) {
        const message = [
          '⚠️ ATENCIÓN: esta patente está en Black List.',
          '',
          `Patente: ${blacklistEntry.plate || displayPlate}`,
          `Motivo: ${blacklistEntry.reason || '—'}`,
          blacklistEntry.notes ? `Notas: ${blacklistEntry.notes}` : null,
          '',
          '¿Querés ocupar la plaza igualmente?',
        ]
          .filter(Boolean)
          .join('\n');

        const continueAnyway = window.confirm(message);

        if (!continueAnyway) {
          showToast('Operación cancelada por Black List.');
          return;
        }
      }

      await db.collection(SPOTS_COLLECTION).doc(spotId).update({
        occupied: true,
        occupantName: displayPlate,
        plateNormalized: normalized,
        startTimestamp: Date.now(),
        vehicleType,
        openedBy: user?.username || user?.email || 'Usuario',
        openedByUid: user?.uid || null,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      setSelectedSpot(null);
      showToast(`Plaza ${spotId} ocupada correctamente.`);
    } catch (error) {
      console.error(error);
      showToast('No se pudo ocupar la plaza. Revisá permisos o conexión.');
    }
  }

  async function releaseSpot(spotId, amount, method) {
    if (!amount || amount <= 0) {
      showToast('Ingresá un monto mayor a 0.');
      return;
    }

    if (!method) {
      showToast('Elegí Efectivo o MP.');
      return;
    }

    try {
      const spotRef = db.collection(SPOTS_COLLECTION).doc(spotId);
      const logRef = db.collection(LOGS_COLLECTION).doc();

      let releasedSpot = null;

      await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(spotRef);

        if (!snap.exists) {
          throw new Error('spot-not-found');
        }

        const spot = spotFromDoc(snap);

        if (!spot.occupied) {
          throw new Error('spot-already-free');
        }

        const endTimestamp = Date.now();

        releasedSpot = spot;

        transaction.set(logRef, {
          spotId: spot.id,
          occupantName: spot.occupantName || '',
          plateNormalized: spot.plateNormalized || normalizePlate(spot.occupantName),
          vehicleType: spot.vehicleType || '',
          startTimestamp: spot.startTimestamp || endTimestamp,
          endTimestamp,
          amount: Number(amount),
          payMethod: method,
          openedBy: spot.openedBy || '—',
          openedByUid: spot.openedByUid || null,
          closedBy: user?.username || user?.email || 'Usuario',
          closedByUid: user?.uid || null,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });

        transaction.update(spotRef, {
          occupied: false,
          occupantName: null,
          plateNormalized: null,
          startTimestamp: null,
          vehicleType: spot.type === 'moto' ? 'Moto' : null,
          openedBy: null,
          openedByUid: null,
          hasKey: false,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
      });

      setSelectedSpot(null);

      showToast(
        `Plaza ${releasedSpot?.id || spotId} liberada. Cobro: ${formatMoney(amount)} / ${method}.`
      );
    } catch (error) {
      console.error(error);

      if (error.message === 'spot-already-free') {
        showToast('La plaza ya está libre.');
        setSelectedSpot(null);
        return;
      }

      showToast('No se pudo liberar la plaza. Revisá permisos o conexión.');
    }
  }

  async function editPlate(spot) {
    const newPlate = window.prompt('Nueva patente:', spot.occupantName || '');

    if (newPlate === null) return;

    const displayPlate = newPlate.trim().toUpperCase();
    const normalized = normalizePlate(displayPlate);

    if (!normalized) {
      showToast('Ingresá una patente válida.');
      return;
    }

    try {
      const duplicates = await db
        .collection(SPOTS_COLLECTION)
        .where('occupied', '==', true)
        .where('plateNormalized', '==', normalized)
        .limit(2)
        .get();

      const alreadyIn = duplicates.docs.find((doc) => doc.id !== spot.id);

      if (alreadyIn) {
        const data = alreadyIn.data();

        showToast(
          `La patente ${displayPlate} ya está ocupando la plaza ${data.id || alreadyIn.id}.`
        );

        return;
      }

      const blacklistEntry = await getActiveBlacklistEntry(displayPlate);

      if (blacklistEntry) {
        const message = [
          '⚠️ ATENCIÓN: esta patente está en Black List.',
          '',
          `Patente: ${blacklistEntry.plate || displayPlate}`,
          `Motivo: ${blacklistEntry.reason || '—'}`,
          blacklistEntry.notes ? `Notas: ${blacklistEntry.notes}` : null,
          '',
          '¿Querés cambiar la patente igualmente?',
        ]
          .filter(Boolean)
          .join('\n');

        const continueAnyway = window.confirm(message);

        if (!continueAnyway) {
          showToast('Cambio cancelado por Black List.');
          return;
        }
      }

      await db.collection(SPOTS_COLLECTION).doc(spot.id).update({
        occupantName: displayPlate,
        plateNormalized: normalized,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      setSelectedSpot(null);
      showToast('Patente actualizada.');
    } catch (error) {
      console.error(error);
      showToast('No se pudo actualizar la patente.');
    }
  }


function startMoveSpot(spot) {
  if (!canOperate) {
    showToast('No tenés permisos para mover plazas.');
    return;
  }

  if (!spot?.occupied) {
    showToast('Solo podés mover una plaza ocupada.');
    return;
  }

  setMoveTarget(spot);
}

async function confirmMoveSpot(toSpotId) {
  if (!canOperate) {
    showToast('No tenés permisos para mover plazas.');
    return;
  }

  if (!moveTarget?.id) {
    showToast('No hay una plaza seleccionada para mover.');
    return;
  }

  if (moveTarget.id === toSpotId) {
    showToast('Elegí una plaza diferente.');
    return;
  }

  try {
    const fromRef = db.collection(SPOTS_COLLECTION).doc(moveTarget.id);
    const toRef = db.collection(SPOTS_COLLECTION).doc(toSpotId);

    await db.runTransaction(async (transaction) => {
      const fromSnap = await transaction.get(fromRef);
      const toSnap = await transaction.get(toRef);

      if (!fromSnap.exists || !toSnap.exists) {
        throw new Error('spot-not-found');
      }

      const fromSpot = spotFromDoc(fromSnap);
      const toSpot = spotFromDoc(toSnap);

      if (!fromSpot.occupied) {
        throw new Error('from-not-occupied');
      }

      if (toSpot.occupied) {
        throw new Error('to-occupied');
      }

      if (toSpot.blocked) {
        throw new Error('to-blocked');
      }

      transaction.update(toRef, {
        occupied: true,
        occupantName: fromSpot.occupantName || '',
        plateNormalized: fromSpot.plateNormalized || normalizePlate(fromSpot.occupantName),
        startTimestamp: fromSpot.startTimestamp || Date.now(),
        vehicleType: fromSpot.vehicleType || (toSpot.type === 'moto' ? 'Moto' : 'Auto'),
        openedBy: fromSpot.openedBy || '—',
        openedByUid: fromSpot.openedByUid || null,
        hasKey: fromSpot.hasKey === true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });

      transaction.update(fromRef, {
        occupied: false,
        occupantName: null,
        plateNormalized: null,
        startTimestamp: null,
        vehicleType: fromSpot.type === 'moto' ? 'Moto' : null,
        openedBy: null,
        openedByUid: null,
        hasKey: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    });

    showToast(`Plaza ${moveTarget.id} movida a ${toSpotId}.`);
    setMoveTarget(null);
    setSelectedSpot(null);
  } catch (error) {
    console.error(error);

    if (error.message === 'to-occupied') {
      showToast('La plaza destino está ocupada.');
      return;
    }

    if (error.message === 'to-blocked') {
      showToast('La plaza destino está bloqueada.');
      return;
    }

    if (error.message === 'from-not-occupied') {
      showToast('La plaza origen ya no está ocupada.');
      return;
    }

    showToast('No se pudo mover la plaza.');
  }
}

  
async function setSpotKey(spotId, hasKey) {
  if (!canOperate) {
    showToast('No tenés permisos para modificar la llave.');
    return;
  }

  try {
    await db.collection(SPOTS_COLLECTION).doc(spotId).update({
      hasKey,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    setSelectedSpot((current) =>
      current?.id === spotId
        ? {
            ...current,
            hasKey,
          }
        : current
    );

    showToast(hasKey ? `Llave agregada a la plaza ${spotId}.` : `Llave quitada de la plaza ${spotId}.`);
  } catch (error) {
    console.error(error);
    showToast('No se pudo actualizar la llave.');
  }
}


async function setSpotBlocked(spotId, blocked) {
  if (!canOperate) {
    showToast('No tenés permisos para bloquear o desbloquear plazas.');
    return;
  }

  const spot = spots.find((item) => item.id === spotId);

  if (spot?.occupied && blocked) {
    showToast('No se puede bloquear una plaza ocupada.');
    return;
  }

  try {
    await db.collection(SPOTS_COLLECTION).doc(spotId).update({
      blocked,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    setSelectedSpot(null);
    showToast(blocked ? `Plaza ${spotId} bloqueada.` : `Plaza ${spotId} desbloqueada.`);
  } catch (error) {
    console.error(error);
    showToast('No se pudo cambiar el estado de la plaza.');
  }
}

  const links = [
    {
      to: '/history',
      label: 'Historial diario',
    },
  ];

  if (user?.role === 'admin') {
    links.push({
      to: '/admin',
      label: 'Admin',
    });
  }

  return (
    <>
      <Topbar title="Estacionamiento Azul" links={links} />

      <main className="layout">
        <section className="hero-card">
          <div>
            <p className="eyebrow">Panel principal</p>
            <h2>Estado de plazas</h2>
            <p className="muted">Control de plazas en tiempo real para el estacionamiento.</p>
          </div>
        </section>

        <section className="toolbar">
          <label className="search-box">
            <span>Buscar patente o plaza</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              type="search"
              placeholder="Ej: AB123CD, 12, M1"
              autoComplete="off"
            />
          </label>

            <div className="legend" aria-label="Leyenda">
              <span><i className="dot dot--free-auto"></i> Auto libre</span>
              <span><i className="dot dot--free-moto"></i> Moto libre</span>
              <span><i className="dot dot--occupied-new"></i> Ocupada</span>
              <span><i className="dot dot--blocked-new"></i> Bloqueada</span>
            </div>
        </section>

        <section>
          <div className="spots-grid" aria-live="polite">
            {!visibleSpots.length ? (
              <p className="muted">
                No hay plazas para mostrar. Un administrador puede crearlas desde el panel admin.
              </p>
            ) : (
              visibleSpots.map((spot) => {
                const status = getSpotStatus(spot);
                const label = getStatusLabel(spot);
                const plate = spot.occupied ? spot.occupantName || '—' : '';
                const meta = spot.occupied && spot.hasKey ? '🔑 Llave' : '';

                return (
                  <button
                    key={spot.id}
                    className={`spot-card spot-card--${status} spot-card--type-${spot.type === 'moto' ? 'moto' : 'auto'}`}
                    type="button"
                    onClick={() => setSelectedSpot(spot)}
                  >
                    <span className="spot-card__top">
                      <span className="spot-card__id">{spot.id}</span>
                      <span className="spot-card__badge">{label}</span>
                    </span>

                    {plate ? <span className="spot-card__plate">{plate}</span> : null}
                    {meta ? <span className="spot-card__meta">{meta}</span> : null}
                  </button>
                );
              })
            )}
          </div>
        </section>
      </main>

      <SpotModal
        spot={selectedSpot}
        canOperate={canOperate}
        isAdmin={isAdmin}
        onClose={() => setSelectedSpot(null)}
        occupySpot={occupySpot}
        releaseSpot={releaseSpot}
        editPlate={editPlate}
        setSpotBlocked={setSpotBlocked}
        setSpotKey={setSpotKey}
        startMoveSpot={startMoveSpot}
      />
      <MoveSpotModal
        source={moveTarget}
        spots={spots}
        onClose={() => setMoveTarget(null)}
        onConfirm={confirmMoveSpot}
      />
    </>
  );
}

function SpotModal({
  spot,
  canOperate,
  isAdmin,
  onClose,
  occupySpot,
  releaseSpot,
  editPlate,
  setSpotBlocked,
  setSpotKey,
  startMoveSpot,
}) {
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('');

    useEffect(() => {
    setAmount('');
    setMethod('');
  }, [spot?.id]);

  if (!spot) return null;

  const status = getSpotStatus(spot);

  return (
    <Modal open={!!spot} onClose={onClose}>
      {!canOperate ? (
        <>
          <div className="modal-title">
            <span>👁️</span>
            <h3 id="modalTitle">Lugar {spot.id}</h3>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>Estado</span>
              <strong>{getStatusLabel(spot)}</strong>
            </div>

            <div className="detail-row">
              <span>Patente</span>
              <strong>{spot.occupantName || 'Sin vehículo'}</strong>
            </div>

            <div className="detail-row">
              <span>Tipo</span>
              <strong>{spot.vehicleType || (spot.type === 'moto' ? 'Moto' : 'Auto')}</strong>
            </div>
          </div>

          <p className="muted">
            Tu cuenta está en modo visitante. Un administrador debe habilitarte como usuario para
            operar plazas.
          </p>

          <div className="modal-actions">
            <button className="ghost-btn" type="button" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      ) : null}

      {canOperate && status === 'free' ? (
        <FreeSpotForm
          spot={spot}
          canOperate={canOperate}
          onClose={onClose}
          occupySpot={occupySpot}
          setSpotBlocked={setSpotBlocked}
        />
      ) : null}

      {canOperate && status === 'occupied' ? (
        <>
          <div className="modal-title">
            <span>🚗</span>
            <h3 id="modalTitle">Lugar {spot.id}</h3>
          </div>

          <div className="detail-list">
            <div className="detail-row">
              <span>Patente</span>
              <strong>{spot.occupantName || '—'}</strong>
            </div>

            <div className="detail-row">
              <span>Tipo</span>
              <strong>{spot.vehicleType || '—'}</strong>
            </div>

            <div className="detail-row">
              <span>Desde</span>
              <strong>{spot.startTimestamp ? formatDateTime(spot.startTimestamp) : '—'}</strong>
            </div>

            <div className="detail-row">
              <span>Llave</span>
              <strong>{spot.hasKey ? '🔑 Sí' : 'No'}</strong>
            </div>

            <div className="detail-row">
              <span>Tiempo</span>
              <strong>{formatDuration(spot.startTimestamp)}</strong>
            </div>

            <div className="detail-row">
              <span>Abrió</span>
              <strong>{spot.openedBy || '—'}</strong>
            </div>
          </div>

          <form
            className="form-grid"
            onSubmit={(event) => {
              event.preventDefault();
              releaseSpot(spot.id, Number(String(amount).replace(',', '.')), method);
            }}
          >
            <label className="form-field">
              <span>Monto cobrado</span>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[.,]?[0-9]*"
                placeholder="Ej: 1600"
                required
              />
            </label>

<div className="form-field">
  <span>Método de pago</span>

  <div className="payment-options" role="group" aria-label="Método de pago">
    <button
      type="button"
      className={`payment-option ${method === 'EFECTIVO' ? 'is-selected' : ''}`}
      onClick={() => setMethod('EFECTIVO')}
    >
      {method === 'EFECTIVO' ? '✓ ' : ''}Efectivo
    </button>

    <button
      type="button"
      className={`payment-option ${method === 'MP' ? 'is-selected' : ''}`}
      onClick={() => setMethod('MP')}
    >
      {method === 'MP' ? '✓ ' : ''}MP
    </button>
  </div>
</div>

            <div className="modal-actions">
              <button className="ghost-btn" type="button" onClick={() => editPlate(spot)}>
                Editar patente
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={() => startMoveSpot(spot)}
              >
                Mover plaza
              </button>

              <button
                className={spot.hasKey ? 'secondary-btn' : 'primary-btn'}
                type="button"
                onClick={() => setSpotKey(spot.id, !spot.hasKey)}
              >
                {spot.hasKey ? 'Quitar llave' : 'Agregar llave'}
              </button>


              <button className="ghost-btn" type="button" onClick={onClose}>
                Cerrar
              </button>

              <button className="danger-btn" type="submit">
                Liberar plaza
              </button>
            </div>
          </form>
        </>
      ) : null}

      {canOperate && status === 'blocked' ? (
        <>
          <div className="modal-title">
            <span>🔒</span>
            <h3 id="modalTitle">Lugar {spot.id}</h3>
          </div>

          <div className="status-alert status-alert--blocked">
            🚫 Esta plaza está bloqueada
          </div>

          <div className="modal-actions">
            <button className="ghost-btn" type="button" onClick={onClose}>
              Cerrar
            </button>

            {canOperate ? (
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setSpotBlocked(spot.id, false)}
              >
                Desbloquear plaza
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </Modal>
  );
}

function FreeSpotForm({
  spot,
  canOperate,
  onClose,
  occupySpot,
  setSpotBlocked,
}) {
  const [plate, setPlate] = useState('');
  const [vehicleType, setVehicleType] = useState(
    spot.type === 'moto' ? 'Moto' : 'Auto'
  );

  return (
    <>
      <div className="modal-title">
        <span>🅿️</span>
        <h3 id="modalTitle">Lugar {spot.id}</h3>
      </div>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          occupySpot(spot.id, plate, vehicleType);
        }}
      >
        <label className="form-field">
          <span>Número de patente</span>
          <input
            value={plate}
            onChange={(event) => setPlate(event.target.value)}
            type="text"
            placeholder="Ej: AB123CD"
            autoComplete="off"
            required
            autoFocus
          />
        </label>

        <label className="form-field">
          <span>Tipo de vehículo</span>
          <select
            value={vehicleType}
            onChange={(event) => setVehicleType(event.target.value)}
            required
          >
            <option value="Auto">Auto</option>
            <option value="Camioneta">Camioneta</option>
            <option value="Moto">Moto</option>
          </select>
        </label>

        <div className="modal-actions">
            {canOperate ? (
              <button
                className="secondary-btn"
                type="button"
                onClick={() => setSpotBlocked(spot.id, true)}
              >
                Bloquear plaza
              </button>
            ) : null}

          <button className="ghost-btn" type="button" onClick={onClose}>
            Cerrar
          </button>

          <button className="primary-btn" type="submit">
            Ocupar plaza
          </button>
        </div>
      </form>
    </>
  );
}

function MoveSpotModal({ source, spots, onClose, onConfirm }) {
  const [targetId, setTargetId] = useState('');

  useEffect(() => {
    setTargetId('');
  }, [source?.id]);

  if (!source) return null;

  const availableSpots = spots.filter(
    (spot) =>
      spot.id !== source.id &&
      spot.occupied !== true &&
      spot.blocked !== true
  );

  return (
    <Modal open={!!source} onClose={onClose} labelledBy="moveSpotTitle">
      <div className="modal-title">
        <span>🔁</span>
        <h3 id="moveSpotTitle">Mover plaza</h3>
      </div>

      <div className="detail-list">
        <div className="detail-row">
          <span>Origen</span>
          <strong>Plaza {source.id}</strong>
        </div>

        <div className="detail-row">
          <span>Patente</span>
          <strong>{source.occupantName || '—'}</strong>
        </div>

        <div className="detail-row">
          <span>Llave</span>
          <strong>{source.hasKey ? '🔑 Sí' : 'No'}</strong>
        </div>
      </div>

      <form
        className="form-grid"
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm(targetId);
        }}
      >
        <label className="form-field">
          <span>Plaza destino</span>
          <select
            value={targetId}
            onChange={(event) => setTargetId(event.target.value)}
            required
          >
            <option value="">Elegí una plaza libre</option>

            {availableSpots.map((spot) => (
              <option key={spot.id} value={spot.id}>
                Plaza {spot.id} · {spot.type === 'moto' ? 'Moto' : 'Auto'}
              </option>
            ))}
          </select>
        </label>

        {!availableSpots.length ? (
          <p className="muted">
            No hay plazas libres disponibles para mover este vehículo.
          </p>
        ) : null}

        <div className="modal-actions">
          <button className="ghost-btn" type="button" onClick={onClose}>
            Cancelar
          </button>

          <button
            className="primary-btn"
            type="submit"
            disabled={!availableSpots.length}
          >
            Confirmar movimiento
          </button>
        </div>
      </form>
    </Modal>
  );
}