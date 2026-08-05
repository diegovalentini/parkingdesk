import { functions } from '../firebase/firebase';
import {
  isPlatformAdmin,
  parkingLotRef,
  parkingLotsCollectionRef,
  requireParkingLotId,
} from '../firebase/parkingLotRefs';

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeParkingLotCode(value) {
  return cleanText(value).toUpperCase();
}

function parkingLotFromDoc(doc) {
  const data = doc.data() || {};

  return {
    id: doc.id,
    name: data.name || 'Playa sin nombre',
    code: data.code || '',
    address: data.address || '',
    primaryAdminName: data.primaryAdminName || '',
    contact: data.contact || '',
    timezone:
      data.timezone || 'America/Argentina/Buenos_Aires',
    active: data.active !== false,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdBy: data.createdBy || null,
    createdByUid: data.createdByUid || null,
    updatedBy: data.updatedBy || null,
    updatedByUid: data.updatedByUid || null,
  };
}

function requirePlatformAdmin(user) {
  if (!isPlatformAdmin(user)) {
    throw new Error(
      'No tenés permisos para administrar las playas.'
    );
  }
}

export async function getParkingLot(parkingLotId) {
  const cleanParkingLotId = requireParkingLotId(parkingLotId);

  const snap = await parkingLotRef(cleanParkingLotId).get();

  if (!snap.exists) {
    return null;
  }

  return parkingLotFromDoc(snap);
}

export async function listParkingLots(user) {
  requirePlatformAdmin(user);

  const snapshot = await parkingLotsCollectionRef()
    .orderBy('name', 'asc')
    .get();

  return snapshot.docs.map(parkingLotFromDoc);
}

export async function createParkingLotWithAdmin({
  parkingLotId,
  name,
  code,
  address = '',
  timezone = 'America/Argentina/Buenos_Aires',
  primaryAdminName = '',
  contact = '',
  adminUsername,
  adminEmail,
  adminPassword,
  user,
}) {
  requirePlatformAdmin(user);

  const cleanParkingLotId = requireParkingLotId(parkingLotId);
  const cleanName = cleanText(name);
  const cleanCode = normalizeParkingLotCode(code);
  const cleanAddress = cleanText(address);
  const cleanTimezone = cleanText(timezone);
  const cleanPrimaryAdminName = cleanText(primaryAdminName);
  const cleanContact = cleanText(contact);

  const cleanAdminUsername = cleanText(adminUsername);
  const cleanAdminEmail = cleanText(adminEmail).toLowerCase();
  const cleanAdminPassword = String(adminPassword || '');

  if (!cleanName) {
    throw new Error('Ingresá el nombre de la playa.');
  }

  if (!cleanCode) {
    throw new Error('Ingresá el código de la playa.');
  }

  if (!cleanTimezone) {
    throw new Error('Ingresá una zona horaria válida.');
  }

  if (!cleanAdminUsername) {
    throw new Error('Ingresá el nombre del administrador.');
  }

  if (!cleanAdminEmail) {
    throw new Error('Ingresá el email del administrador.');
  }

  if (cleanAdminPassword.length < 6) {
    throw new Error(
      'La contraseña del administrador debe tener mínimo 6 caracteres.'
    );
  }

  const callable = functions.httpsCallable(
    'createParkingLotWithAdmin'
  );

  try {
    const response = await callable({
      parkingLotId: cleanParkingLotId,
      name: cleanName,
      code: cleanCode,
      address: cleanAddress,
      timezone: cleanTimezone,
      primaryAdminName: cleanPrimaryAdminName,
      contact: cleanContact,
      adminUsername: cleanAdminUsername,
      adminEmail: cleanAdminEmail,
      adminPassword: cleanAdminPassword,
    });

    return response.data;
  } catch (error) {
    console.error(
      'Error creando playa y administrador:',
      error
    );

    const message =
      error?.message ||
      error?.details ||
      'No se pudo crear la playa y su administrador.';

    throw new Error(message);
  }
}

export async function updateParkingLot({
  parkingLotId,
  name,
  code,
  address = '',
  timezone,
  primaryAdminName = '',
  contact = '',
  user,
}) {
  requirePlatformAdmin(user);

  const cleanParkingLotId =
    requireParkingLotId(parkingLotId);

  const cleanName =
    cleanText(name);

  const cleanCode =
    normalizeParkingLotCode(code);

  const cleanAddress =
    cleanText(address);

  const cleanTimezone =
    cleanText(timezone);

  const cleanPrimaryAdminName =
    cleanText(primaryAdminName);

  const cleanContact =
    cleanText(contact);

  if (!cleanName) {
    throw new Error(
      'Ingresá el nombre de la playa.'
    );
  }

  if (!cleanCode) {
    throw new Error(
      'Ingresá el código de la playa.'
    );
  }

  if (!cleanTimezone) {
    throw new Error(
      'Ingresá una zona horaria válida.'
    );
  }

  const callable = functions.httpsCallable(
    'updateParkingLot'
  );

  try {
    const response = await callable({
      parkingLotId: cleanParkingLotId,
      name: cleanName,
      code: cleanCode,
      address: cleanAddress,
      timezone: cleanTimezone,
      primaryAdminName: cleanPrimaryAdminName,
      contact: cleanContact,
    });

    return response.data;
  } catch (error) {
    console.error(
      'Error actualizando playa:',
      error
    );

    const message =
      error?.message ||
      error?.details ||
      'No se pudo actualizar la playa.';

    throw new Error(message);
  }
}



export async function setParkingLotActive({
  parkingLotId,
  active,
  user,
}) {
  requirePlatformAdmin(user);

  const callable =
    functions.httpsCallable(
      'setParkingLotActive'
    );

  try {
    const response =
      await callable({
        parkingLotId:
          requireParkingLotId(
            parkingLotId
          ),
        active: active === true,
      });

    return response.data;
  } catch (error) {
    console.error(
      'Error cambiando estado de la playa:',
      error
    );

    throw new Error(
      error?.message ||
        error?.details ||
        'No se pudo actualizar la playa.'
    );
  }
}
