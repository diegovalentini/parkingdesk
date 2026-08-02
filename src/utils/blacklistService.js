import { firebase } from '../firebase/firebase';
import { parkingLotBlacklistRef } from '../firebase/parkingLotRefs';

export function normalizePlate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function listenBlacklist(
  parkingLotId,
  callback,
  onError
) {
  const query = parkingLotBlacklistRef(parkingLotId).orderBy(
    'createdAt',
    'desc'
  );

  return query.onSnapshot(
    (snapshot) => {
      const entries = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data(),
      }));

      callback(entries);
    },
    onError
  );
}

export async function addBlacklistEntry({
  parkingLotId,
  plate,
  reason,
  notes,
  user,
}) {
  const cleanPlate = String(plate || '')
    .trim()
    .toUpperCase();

  const plateNormalized = normalizePlate(cleanPlate);

  if (!plateNormalized || !reason?.trim()) {
    throw new Error('Ingresá patente y motivo.');
  }

  await parkingLotBlacklistRef(parkingLotId)
    .doc(plateNormalized)
    .set(
      {
        plate: cleanPlate,
        plateNormalized,
        reason: reason.trim(),
        notes: String(notes || '').trim(),
        active: true,
        createdAt:
          firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt:
          firebase.firestore.FieldValue.serverTimestamp(),
        createdBy:
          user?.username || user?.email || 'Admin',
        createdByUid: user?.uid || null,
        updatedBy:
          user?.username || user?.email || 'Admin',
        updatedByUid: user?.uid || null,
      },
      { merge: true }
    );
}

export async function setBlacklistActive(
  parkingLotId,
  plateNormalized,
  active,
  user
) {
  await parkingLotBlacklistRef(parkingLotId)
    .doc(plateNormalized)
    .set(
      {
        active,
        updatedAt:
          firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy:
          user?.username || user?.email || 'Admin',
        updatedByUid: user?.uid || null,
      },
      { merge: true }
    );
}

export async function deleteBlacklistEntry(
  parkingLotId,
  plateNormalized
) {
  await parkingLotBlacklistRef(parkingLotId)
    .doc(plateNormalized)
    .delete();
}

export async function getActiveBlacklistEntry(
  parkingLotId,
  plate
) {
  const plateNormalized = normalizePlate(plate);

  if (!plateNormalized) {
    return null;
  }

  const snapshot = await parkingLotBlacklistRef(parkingLotId)
    .doc(plateNormalized)
    .get();

  if (!snapshot.exists) {
    return null;
  }

  const data = snapshot.data() || {};

  if (data.active === false) {
    return null;
  }

  return {
    id: snapshot.id,
    ...data,
  };
}