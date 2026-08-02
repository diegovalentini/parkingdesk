import { db } from './firebase';

export const DEFAULT_PARKING_LOT_ID = 'estacion-azul-principal';

export const USER_ROLES = {
  PLATFORM_ADMIN: 'platform_admin',
  ADMIN: 'admin',
  USER: 'user',
  VIEWER: 'viewer',
};

export function isPlatformAdmin(user) {
  return user?.role === USER_ROLES.PLATFORM_ADMIN;
}

export function isValidParkingLotId(parkingLotId) {
  return (
    typeof parkingLotId === 'string' &&
    parkingLotId.trim().length > 0
  );
}

export function requireParkingLotId(parkingLotId) {
  if (!isValidParkingLotId(parkingLotId)) {
    throw new Error('No hay una playa de estacionamiento válida seleccionada.');
  }

  return parkingLotId.trim();
}

export function parkingLotsCollectionRef() {
  return db.collection('parkingLots');
}

export function usersCollectionRef() {
  return db.collection('users');
}

export function parkingLotUsersQuery(parkingLotId) {
  const cleanParkingLotId = requireParkingLotId(parkingLotId);

  return usersCollectionRef().where(
    'parkingLotId',
    '==',
    cleanParkingLotId
  );
}

export function parkingLotRef(parkingLotId) {
  const cleanParkingLotId = requireParkingLotId(parkingLotId);

  return parkingLotsCollectionRef().doc(cleanParkingLotId);
}

export function parkingLotSpotsRef(parkingLotId) {
  return parkingLotRef(parkingLotId).collection('spots');
}

export function parkingLotLogsRef(parkingLotId) {
  return parkingLotRef(parkingLotId).collection('logs');
}

export function parkingLotBlacklistRef(parkingLotId) {
  return parkingLotRef(parkingLotId).collection('blacklist');
}

export function parkingLotSettingsRef(parkingLotId) {
  return parkingLotRef(parkingLotId).collection('settings');
}

export function parkingLotSettingsDocRef(parkingLotId) {
  return parkingLotSettingsRef(parkingLotId).doc('config');
}

export function getUserParkingLotId(user) {
  if (!user || isPlatformAdmin(user)) {
    return null;
  }

  return isValidParkingLotId(user.parkingLotId)
    ? user.parkingLotId.trim()
    : null;
}