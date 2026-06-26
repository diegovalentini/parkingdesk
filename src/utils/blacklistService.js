import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

import { db } from '../firebase/firebase';

export function normalizePlate(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function listenBlacklist(callback, onError) {
  const q = query(
    collection(db, 'blacklist'),
    orderBy('createdAt', 'desc')
  );

  return onSnapshot(
    q,
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

export async function addBlacklistEntry({ plate, reason, notes, user }) {
  const cleanPlate = String(plate || '').trim().toUpperCase();
  const plateNormalized = normalizePlate(cleanPlate);

  if (!plateNormalized || !reason?.trim()) {
    throw new Error('Ingresá patente y motivo.');
  }

  await setDoc(
    doc(db, 'blacklist', plateNormalized),
    {
      plate: cleanPlate,
      plateNormalized,
      reason: reason.trim(),
      notes: String(notes || '').trim(),
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user?.username || user?.email || 'Admin',
      createdByUid: user?.uid || null,
      updatedBy: user?.username || user?.email || 'Admin',
      updatedByUid: user?.uid || null,
    },
    { merge: true }
  );
}

export async function setBlacklistActive(plateNormalized, active, user) {
  await setDoc(
    doc(db, 'blacklist', plateNormalized),
    {
      active,
      updatedAt: serverTimestamp(),
      updatedBy: user?.username || user?.email || 'Admin',
      updatedByUid: user?.uid || null,
    },
    { merge: true }
  );
}

export async function deleteBlacklistEntry(plateNormalized) {
  await deleteDoc(doc(db, 'blacklist', plateNormalized));
}

export async function getActiveBlacklistEntry(plate) {
  const plateNormalized = normalizePlate(plate);
  if (!plateNormalized) return null;

  const snap = await getDoc(doc(db, 'blacklist', plateNormalized));
  if (!snap.exists()) return null;

  const data = snap.data();
  if (data.active === false) return null;

  return {
    id: snap.id,
    ...data,
  };
}