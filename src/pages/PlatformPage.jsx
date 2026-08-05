import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../auth/AuthContext';
import {
  createParkingLotWithAdmin,
  listParkingLots,
  setParkingLotActive,
  updateParkingLot,
} from '../services/parkingLotsService';

const DEFAULT_TIMEZONE = 'America/Argentina/Buenos_Aires';

const INITIAL_CREATE_FORM = {
  parkingLotId: '',
  name: '',
  code: '',
  address: '',
  timezone: DEFAULT_TIMEZONE,
  primaryAdminName: '',
  contact: '',

  adminUsername: '',
  adminEmail: '',
  adminPassword: '',
  adminPasswordConfirm: '',
};

const INITIAL_EDIT_FORM = {
  name: '',
  code: '',
  address: '',
  timezone: DEFAULT_TIMEZONE,
  primaryAdminName: '',
  contact: '',
};

function normalizeParkingLotId(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatCreationDate(value) {
  if (!value) {
    return 'No disponible';
  }

  const date =
    typeof value.toDate === 'function'
      ? value.toDate()
      : typeof value.toMillis === 'function'
        ? new Date(value.toMillis())
        : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'No disponible';
  }

  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function getContactLabel(parkingLot) {
  return parkingLot.contact || 'No asignado';
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function PlatformPage() {
  const {
  user,
  logout,
  enterParkingLotAsPlatform,
  } = useAuth();

  const navigate = useNavigate();

  const [parkingLots, setParkingLots] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState(
    INITIAL_CREATE_FORM
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const [editingParkingLotId, setEditingParkingLotId] =
    useState(null);
  const [editForm, setEditForm] = useState(INITIAL_EDIT_FORM);
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState('');

  const [changingStatusId, setChangingStatusId] =
    useState(null);

  const [successMessage, setSuccessMessage] = useState('');

  const normalizedSearchTerm =
    normalizeSearchText(searchTerm);

  const filteredParkingLots = normalizedSearchTerm
    ? parkingLots.filter((parkingLot) =>
        normalizeSearchText(parkingLot.name).includes(
          normalizedSearchTerm
        )
      )
    : parkingLots;

  const loadParkingLots = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const result = await listParkingLots(user);
      setParkingLots(result);
    } catch (loadError) {
      console.error('Error cargando playas:', loadError);

      setError(
        loadError?.message ||
          'No se pudieron cargar las playas.'
      );
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadParkingLots();
  }, [loadParkingLots]);

  function handleCreateInputChange(event) {
    const { name, value } = event.target;

    setCreateForm((current) => ({
      ...current,
      [name]:
        name === 'parkingLotId'
          ? normalizeParkingLotId(value)
          : value,
    }));
  }

  function handleCreateNameChange(event) {
    const value = event.target.value;

    setCreateForm((current) => ({
      ...current,
      name: value,
      parkingLotId: current.parkingLotId
        ? current.parkingLotId
        : normalizeParkingLotId(value),
    }));
  }

  function handleEditInputChange(event) {
    const { name, value } = event.target;

    setEditForm((current) => ({
      ...current,
      [name]: value,
    }));
  }

  function openCreateForm() {
    setEditingParkingLotId(null);
    setEditError('');
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateError('');
    setSuccessMessage('');
    setShowCreateForm(true);
  }

  function closeCreateForm() {
    if (creating) {
      return;
    }

    setShowCreateForm(false);
    setCreateForm(INITIAL_CREATE_FORM);
    setCreateError('');
  }

  function openEditForm(parkingLot) {
    setShowCreateForm(false);
    setCreateError('');
    setSuccessMessage('');
    setEditError('');

    setEditingParkingLotId(parkingLot.id);

    setEditForm({
      name: parkingLot.name || '',
      code: parkingLot.code || '',
      address: parkingLot.address || '',
      timezone:
        parkingLot.timezone || DEFAULT_TIMEZONE,
      primaryAdminName:
        parkingLot.primaryAdminName || '',
      contact: parkingLot.contact || '',
    });
  }

  function closeEditForm() {
    if (updating) {
      return;
    }

    setEditingParkingLotId(null);
    setEditForm(INITIAL_EDIT_FORM);
    setEditError('');
  }

  async function handleCreateParkingLot(event) {
    event.preventDefault();

    setCreateError('');
    setSuccessMessage('');

    const cleanParkingLotId = normalizeParkingLotId(
      createForm.parkingLotId
    );

    if (!cleanParkingLotId) {
      setCreateError(
        'Ingresá un identificador válido para la playa.'
      );
      return;
    }

    if (
  createForm.adminPassword !==
  createForm.adminPasswordConfirm
) {
  setCreateError(
    'Las contraseñas del administrador no coinciden.'
  );
  return;
}

    setCreating(true);

    try {
            await createParkingLotWithAdmin({
              parkingLotId: cleanParkingLotId,
              name: createForm.name,
              code: createForm.code,
              address: createForm.address,
              timezone: createForm.timezone,
              primaryAdminName:
                createForm.primaryAdminName,
              contact: createForm.contact,
            
              adminUsername: createForm.adminUsername,
              adminEmail: createForm.adminEmail,
              adminPassword: createForm.adminPassword,
            
              user,
            });

            setSuccessMessage(
              `La playa "${createForm.name.trim()}" y su administrador fueron creados correctamente.`
            );
      setCreateForm(INITIAL_CREATE_FORM);
      setShowCreateForm(false);

      await loadParkingLots();
    } catch (errorCreating) {
      const message =
        errorCreating?.message ||
        'No se pudo crear la playa.';

      setCreateError(message);

      if (
        message !==
        'Ya existe una playa con ese identificador.'
      ) {
        console.error(
          'Error creando playa:',
          errorCreating
        );
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleUpdateParkingLot(event) {
    event.preventDefault();

    if (!editingParkingLotId) {
      return;
    }

    setEditError('');
    setSuccessMessage('');
    setUpdating(true);

    try {
      await updateParkingLot({
        parkingLotId: editingParkingLotId,
        name: editForm.name,
        code: editForm.code,
        address: editForm.address,
        timezone: editForm.timezone,
        primaryAdminName:
          editForm.primaryAdminName,
        contact: editForm.contact,
        user,
      });

      setSuccessMessage(
        `La playa "${editForm.name.trim()}" fue actualizada correctamente.`
      );

      setEditingParkingLotId(null);
      setEditForm(INITIAL_EDIT_FORM);

      await loadParkingLots();
    } catch (updateError) {
      console.error(
        'Error actualizando playa:',
        updateError
      );

      setEditError(
        updateError?.message ||
          'No se pudo actualizar la playa.'
      );
    } finally {
      setUpdating(false);
    }
  }

  async function handleToggleParkingLot(parkingLot) {
    const nextActive = !parkingLot.active;

    const actionText = nextActive
      ? 'activar'
      : 'desactivar';

    const confirmed = window.confirm(
      `¿Seguro que querés ${actionText} la playa "${parkingLot.name}"?`
    );

    if (!confirmed) {
      return;
    }

    setSuccessMessage('');
    setError('');
    setChangingStatusId(parkingLot.id);

    try {
      await setParkingLotActive({
        parkingLotId: parkingLot.id,
        active: nextActive,
        user,
      });

      setSuccessMessage(
        nextActive
          ? `La playa "${parkingLot.name}" fue activada correctamente.`
          : `La playa "${parkingLot.name}" fue desactivada correctamente.`
      );

      await loadParkingLots();
    } catch (statusError) {
      console.error(
        'Error cambiando estado de la playa:',
        statusError
      );

      setError(
        statusError?.message ||
          'No se pudo cambiar el estado de la playa.'
      );
    } finally {
      setChangingStatusId(null);
    }
  }

  function handleEnterParkingLot(parkingLot) {
  if (!parkingLot?.id) {
    setError('No se recibió una playa válida.');
    return;
  }

  if (parkingLot.active === false) {
    setError(
      `La playa "${parkingLot.name}" está inactiva y no se puede abrir.`
    );
    return;
  }

  setError('');
  setSuccessMessage('');

  try {
    enterParkingLotAsPlatform(parkingLot.id);
    navigate('/', { replace: true });
  } catch (enterError) {
    console.error(
      'Error entrando a la playa:',
      enterError
    );

    setError(
      enterError?.message ||
        'No se pudo entrar a la playa.'
    );
  }
}

  return (
<main className="layout platform-page">
  <section className="panel platform-shell">
    <header className="platform-header">
      <div>
        <p className="eyebrow">
          Panel de plataforma
        </p>

        <h1>Administración de playas</h1>

        <p className="muted">
          Gestioná las playas, sus administradores y el
          acceso general a la plataforma.
        </p>
      </div>

      <div className="platform-toolbar">
        <button
          className="platform-primary-button"
            type="button"
            onClick={openCreateForm}
            disabled={
              creating ||
              updating ||
              changingStatusId !== null
            }
          >
            Crear nueva playa
          </button>

          <button
            type="button"
            className="platform-secondary-button"
            onClick={logout}
            disabled={
              creating ||
              updating ||
              changingStatusId !== null
            }
          >
            Cerrar sesión
          </button>
        </div>
    </header>

        {successMessage && (
          <p className="platform-success-message">
            {successMessage}
          </p>
        )}

{showCreateForm && (
  <form
    className="platform-form"
    onSubmit={handleCreateParkingLot}
  >
    <h2>Nueva playa</h2>

    <div className="platform-form-grid">
      <div className="platform-field">
        <label htmlFor="parking-lot-name">
          Nombre
        </label>

        <input
          id="parking-lot-name"
          name="name"
          type="text"
          value={createForm.name}
          onChange={handleCreateNameChange}
          placeholder="Ej: Estacionamiento Centro"
          autoComplete="off"
          disabled={creating}
          required
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-id">
          Identificador interno
        </label>

        <input
          id="parking-lot-id"
          name="parkingLotId"
          type="text"
          value={createForm.parkingLotId}
          onChange={handleCreateInputChange}
          placeholder="estacionamiento-centro"
          autoComplete="off"
          disabled={creating}
          required
        />

        <p className="muted">
          Se utiliza internamente y no podrá editarse
          después.
        </p>
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-code">
          Código
        </label>

        <input
          id="parking-lot-code"
          name="code"
          type="text"
          value={createForm.code}
          onChange={handleCreateInputChange}
          placeholder="Ej: CENTRO"
          autoComplete="off"
          disabled={creating}
          required
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-timezone">
          Zona horaria
        </label>

        <input
          id="parking-lot-timezone"
          name="timezone"
          type="text"
          value={createForm.timezone}
          onChange={handleCreateInputChange}
          autoComplete="off"
          disabled={creating}
          required
        />
      </div>

      <div className="platform-field platform-field--full">
        <label htmlFor="parking-lot-address">
          Dirección
        </label>

        <input
          id="parking-lot-address"
          name="address"
          type="text"
          value={createForm.address}
          onChange={handleCreateInputChange}
          placeholder="Dirección de la playa"
          autoComplete="off"
          disabled={creating}
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-primary-admin">
          Administrador principal
        </label>

        <input
          id="parking-lot-primary-admin"
          name="primaryAdminName"
          type="text"
          value={createForm.primaryAdminName}
          onChange={handleCreateInputChange}
          placeholder="Dato informativo"
          autoComplete="off"
          maxLength="100"
          disabled={creating}
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-contact">
          Contacto
        </label>

        <input
          id="parking-lot-contact"
          name="contact"
          type="text"
          value={createForm.contact}
          onChange={handleCreateInputChange}
          placeholder="Teléfono, email o referencia"
          autoComplete="off"
          maxLength="160"
          disabled={creating}
        />
      </div>
    </div>

    <hr />

    <h3>Administrador inicial</h3>

    <p className="muted">
      Esta cuenta administrará la playa y podrá crear las
      cuentas de sus trabajadores.
    </p>

    <div className="platform-form-grid">
      <div className="platform-field">
        <label htmlFor="parking-lot-admin-username">
          Nombre de usuario del administrador
        </label>

        <input
          id="parking-lot-admin-username"
          name="adminUsername"
          type="text"
          value={createForm.adminUsername}
          onChange={handleCreateInputChange}
          placeholder="Ej: Juan Pérez"
          autoComplete="off"
          minLength="3"
          maxLength="60"
          disabled={creating}
          required
        />

        <small className="muted">
          Será único en ParkingDesk y podrá usarse para iniciar sesión.
        </small>
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-admin-email">
          Email del administrador
        </label>

        <input
          id="parking-lot-admin-email"
          name="adminEmail"
          type="email"
          value={createForm.adminEmail}
          onChange={handleCreateInputChange}
          placeholder="admin@email.com"
          autoComplete="off"
          disabled={creating}
          required
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-admin-password">
          Contraseña temporal
        </label>

        <input
          id="parking-lot-admin-password"
          name="adminPassword"
          type="password"
          value={createForm.adminPassword}
          onChange={handleCreateInputChange}
          placeholder="Mínimo 6 caracteres"
          autoComplete="new-password"
          minLength="6"
          disabled={creating}
          required
        />
      </div>

      <div className="platform-field">
        <label htmlFor="parking-lot-admin-password-confirm">
          Confirmar contraseña
        </label>

        <input
          id="parking-lot-admin-password-confirm"
          name="adminPasswordConfirm"
          type="password"
          value={createForm.adminPasswordConfirm}
          onChange={handleCreateInputChange}
          placeholder="Repetí la contraseña"
          autoComplete="new-password"
          minLength="6"
          disabled={creating}
          required
        />
      </div>
    </div>

    {createError && (
      <p className="error-message">
        {createError}
      </p>
    )}

    <div className="platform-form-actions">
      <button
        type="button"
        className="platform-secondary-button"
        onClick={closeCreateForm}
        disabled={creating}
      >
        Cancelar
      </button>

      <button
        type="submit"
        className="platform-primary-button"
        disabled={creating}
      >
        {creating ? 'Creando...' : 'Crear playa'}
      </button>
    </div>
  </form>
)}

        <div className="platform-list-header">
          <h2>Playas registradas</h2>

          <div className="platform-list-tools">
            <input
              className="platform-search-input"
              type="search"
              value={searchTerm}
              onChange={(event) =>
                setSearchTerm(event.target.value)
              }
              placeholder="Buscar por nombre"
              aria-label="Buscar playa por nombre"
              disabled={loading}
            />

            <span className="platform-count">
              {normalizedSearchTerm
                ? `${filteredParkingLots.length} de ${parkingLots.length}`
                : parkingLots.length}{' '}
              {parkingLots.length === 1
                ? 'playa'
                : 'playas'}
            </span>
          </div>
        </div>

        {loading && (
          <p className="muted">
            Cargando playas...
          </p>
        )}

        {!loading && error && (
          <p className="error-message">
            {error}
          </p>
        )}

        {!loading &&
          !error &&
          parkingLots.length === 0 && (
<div className="platform-empty-state">
  <h3>No hay playas registradas</h3>

  <p className="muted">
    Creá la primera playa para comenzar a utilizar la
    plataforma.
  </p>
</div>
          )}

        {!loading &&
          parkingLots.length > 0 && (
            filteredParkingLots.length > 0 ? (
            <div className="platform-grid">
              {filteredParkingLots.map((parkingLot) => {
                const isEditing =
                  editingParkingLotId === parkingLot.id;

                const isChangingStatus =
                  changingStatusId === parkingLot.id;

                return (
<article
  key={parkingLot.id}
  className={`panel platform-lot-card ${
    parkingLot.active
      ? 'platform-lot-card--active'
      : 'platform-lot-card--inactive'
  }`}
>
{!isEditing && (
  <>
    <div className="platform-card-header">
      <div>
        <h2>{parkingLot.name}</h2>

        <p className="platform-card-code">
          Código: {parkingLot.code || 'Sin código'}
        </p>
      </div>

      <span
        className={`platform-status ${
          parkingLot.active
            ? 'platform-status--active'
            : 'platform-status--inactive'
        }`}
      >
        {parkingLot.active ? 'Activa' : 'Inactiva'}
      </span>
    </div>

    <div className="platform-card-overview">
      <div className="platform-card-info">
        <span className="platform-detail-label">
          Dirección
        </span>

        <strong className="platform-detail-value">
          {parkingLot.address || 'Sin dirección'}
        </strong>
      </div>

      <div className="platform-card-info">
        <span className="platform-detail-label">
          Administrador principal
        </span>

        <strong className="platform-detail-value">
          {parkingLot.primaryAdminName || 'No asignado'}
        </strong>
      </div>

      <div className="platform-card-info">
        <span className="platform-detail-label">
          Contacto
        </span>

        <strong className="platform-detail-value">
          {getContactLabel(parkingLot)}
        </strong>
      </div>

      <div className="platform-card-info">
        <span className="platform-detail-label">
          Fecha de creación
        </span>

        <strong className="platform-detail-value">
          {formatCreationDate(parkingLot.createdAt)}
        </strong>
      </div>
    </div>

    <details className="platform-technical-details">
      <summary>Detalles técnicos</summary>

      <div className="platform-details">
        <div className="platform-detail">
          <span className="platform-detail-label">
            ID interno
          </span>

          <span className="platform-detail-value">
            {parkingLot.id}
          </span>
        </div>

        <div className="platform-detail">
          <span className="platform-detail-label">
            Zona horaria
          </span>

          <span
            className="platform-detail-value"
            title={parkingLot.timezone}
          >
            {parkingLot.timezone}
          </span>
        </div>
      </div>
    </details>

    <div className="platform-card-actions">
      <button
        type="button"
        className="platform-primary-button"
        onClick={() =>
          handleEnterParkingLot(parkingLot)
        }
        disabled={
          parkingLot.active === false ||
          creating ||
          updating ||
          changingStatusId !== null
        }
      >
        Entrar
      </button>

      <button
        type="button"
        className="platform-secondary-button"
        onClick={() => openEditForm(parkingLot)}
        disabled={
          creating ||
          updating ||
          changingStatusId !== null
        }
      >
        Editar
      </button>

      <button
        type="button"
        className={
          parkingLot.active
            ? 'platform-danger-button'
            : 'platform-success-button'
        }
        onClick={() =>
          handleToggleParkingLot(parkingLot)
        }
        disabled={
          creating ||
          updating ||
          changingStatusId !== null
        }
      >
        {isChangingStatus
          ? 'Guardando...'
          : parkingLot.active
            ? 'Desactivar'
            : 'Activar'}
      </button>
    </div>
  </>
)}

{isEditing && (
  <form
    className="platform-form"
    onSubmit={handleUpdateParkingLot}
  >
    <h2>Editar playa</h2>

    <p className="muted">
      ID interno: {parkingLot.id}
    </p>

    <div className="platform-form-grid">
      <div className="platform-field">
        <label
          htmlFor={`edit-name-${parkingLot.id}`}
        >
          Nombre
        </label>

        <input
          id={`edit-name-${parkingLot.id}`}
          name="name"
          type="text"
          value={editForm.name}
          onChange={handleEditInputChange}
          disabled={updating}
          required
        />
      </div>

      <div className="platform-field">
        <label
          htmlFor={`edit-code-${parkingLot.id}`}
        >
          Código
        </label>

        <input
          id={`edit-code-${parkingLot.id}`}
          name="code"
          type="text"
          value={editForm.code}
          onChange={handleEditInputChange}
          disabled={updating}
          required
        />
      </div>

      <div className="platform-field">
        <label
          htmlFor={`edit-timezone-${parkingLot.id}`}
        >
          Zona horaria
        </label>

        <input
          id={`edit-timezone-${parkingLot.id}`}
          name="timezone"
          type="text"
          value={editForm.timezone}
          onChange={handleEditInputChange}
          disabled={updating}
          required
        />
      </div>

      <div className="platform-field platform-field--full">
        <label
          htmlFor={`edit-address-${parkingLot.id}`}
        >
          Dirección
        </label>

        <input
          id={`edit-address-${parkingLot.id}`}
          name="address"
          type="text"
          value={editForm.address}
          onChange={handleEditInputChange}
          disabled={updating}
        />
      </div>

      <div className="platform-field">
        <label
          htmlFor={`edit-primary-admin-${parkingLot.id}`}
        >
          Administrador principal
        </label>

        <input
          id={`edit-primary-admin-${parkingLot.id}`}
          name="primaryAdminName"
          type="text"
          value={editForm.primaryAdminName}
          onChange={handleEditInputChange}
          placeholder="Dato informativo"
          autoComplete="off"
          maxLength="100"
          disabled={updating}
        />
      </div>

      <div className="platform-field">
        <label htmlFor={`edit-contact-${parkingLot.id}`}>
          Contacto
        </label>

        <input
          id={`edit-contact-${parkingLot.id}`}
          name="contact"
          type="text"
          value={editForm.contact}
          onChange={handleEditInputChange}
          placeholder="Teléfono, email o referencia"
          autoComplete="off"
          maxLength="160"
          disabled={updating}
        />
      </div>
    </div>

    {editError && (
      <p className="error-message">
        {editError}
      </p>
    )}

    <div className="platform-form-actions">
      <button
        type="button"
        className="platform-secondary-button"
        onClick={closeEditForm}
        disabled={updating}
      >
        Cancelar
      </button>

      <button
        type="submit"
        className="platform-primary-button"
        disabled={updating}
      >
        {updating
          ? 'Guardando...'
          : 'Guardar cambios'}
      </button>
    </div>
  </form>
)}
                  </article>
                );
              })}
            </div>
            ) : (
              <div className="platform-empty-state">
                <h3>No encontramos esa playa</h3>

                <p className="muted">
                  Probá con otro nombre o limpiá la búsqueda.
                </p>
              </div>
            )
          )}
      </section>
    </main>
  );
}
