const {
  HttpsError,
  onCall,
} = require('firebase-functions/v2/https');

const {
  initializeApp,
} = require('firebase-admin/app');

const {
  getAuth,
} = require('firebase-admin/auth');

const {
  FieldValue,
  getFirestore,
} = require('firebase-admin/firestore');

const {
  cleanUsername,
  getUsernameValidationError,
  normalizeUsername,
  usernameRegistryId,
} = require('./usernameUtils');

initializeApp();

const db = getFirestore();
const auth = getAuth();

const REGION = 'southamerica-east1';

const PARKING_LOT_ROLES = [
  'viewer',
  'user',
  'admin',
];

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

function normalizeParkingLotCode(value) {
  return cleanText(value).toUpperCase();
}

function normalizeComparableText(value) {
  return cleanText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function validateOptionalText(value, label, maxLength) {
  if (value.length > maxLength) {
    throw new HttpsError(
      'invalid-argument',
      `${label} no puede superar los ${maxLength} caracteres.`
    );
  }
}

function validateAccountData({
  username,
  email,
  password,
}) {
  const usernameError =
    getUsernameValidationError(username);

  if (usernameError) {
    throw new HttpsError(
      'invalid-argument',
      usernameError
    );
  }

  if (!email || !email.includes('@')) {
    throw new HttpsError(
      'invalid-argument',
      'Ingresá un email válido.'
    );
  }

  if (password.length < 6) {
    throw new HttpsError(
      'invalid-argument',
      'La contraseña debe tener al menos 6 caracteres.'
    );
  }
}

function getUsernameRegistryRef(normalizedUsername) {
  return db
    .collection('usernames')
    .doc(usernameRegistryId(normalizedUsername));
}

function buildUsernameRegistryDocument({
  uid,
  username,
  normalizedUsername,
  email,
}) {
  return {
    uid,
    username,
    normalizedUsername,
    email,
    updatedAt: FieldValue.serverTimestamp(),
  };
}

function assertUsernameAvailable(snapshot, uid = null) {
  if (
    snapshot.exists &&
    snapshot.data()?.uid !== uid
  ) {
    throw new HttpsError(
      'already-exists',
      'Ese nombre de usuario ya está en uso.'
    );
  }
}

async function createFirebaseAuthUser({
  username,
  email,
  password,
}) {
  try {
    return await auth.createUser({
      email,
      password,
      displayName: username,
      disabled: false,
    });
  } catch (error) {
    console.error(
      'Error creando usuario en Firebase Auth:',
      error
    );

    if (error?.code === 'auth/email-already-exists') {
      throw new HttpsError(
        'already-exists',
        'Ya existe una cuenta con ese email.'
      );
    }

    if (error?.code === 'auth/invalid-email') {
      throw new HttpsError(
        'invalid-argument',
        'El email no es válido.'
      );
    }

    if (error?.code === 'auth/invalid-password') {
      throw new HttpsError(
        'invalid-argument',
        'La contraseña no es válida.'
      );
    }

    throw new HttpsError(
      'internal',
      'No se pudo crear la cuenta.'
    );
  }
}

async function rollbackAuthUser(uid) {
  if (!uid) {
    return;
  }

  try {
    await auth.deleteUser(uid);
  } catch (error) {
    console.error(
      'No se pudo revertir el usuario de Auth:',
      error
    );
  }
}

function buildUserDocument({
  uid,
  username,
  email,
  role,
  parkingLotId,
  creator,
}) {
  return {
    uid,
    username,
    usernameNormalized: normalizeUsername(username),
    email,
    role,
    active: true,
    parkingLotId,

    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),

    createdBy:
      creator.username ||
      creator.email ||
      'Administrador',

    createdByUid: creator.uid,
  };
}

async function getAuthenticatedProfile(request) {
  if (!request.auth) {
    throw new HttpsError(
      'unauthenticated',
      'Tenés que iniciar sesión para usar esta función.'
    );
  }

  const userId = request.auth.uid;

  const userSnapshot = await db
    .collection('users')
    .doc(userId)
    .get();

  if (!userSnapshot.exists) {
    throw new HttpsError(
      'permission-denied',
      'No existe el perfil del usuario conectado.'
    );
  }

  const userData = userSnapshot.data() || {};

  if (userData.active === false) {
    throw new HttpsError(
      'permission-denied',
      'Tu cuenta se encuentra desactivada.'
    );
  }

  return {
    uid: userId,
    ...userData,
  };
}

async function requirePlatformAdmin(request) {
  const user = await getAuthenticatedProfile(request);

  if (user.role !== 'platform_admin') {
    throw new HttpsError(
      'permission-denied',
      'Esta función solo puede utilizarla el administrador de plataforma.'
    );
  }

  return user;
}

async function requireParkingLotAdmin(request) {
  const user = await getAuthenticatedProfile(request);

  if (user.role !== 'admin') {
    throw new HttpsError(
      'permission-denied',
      'Esta función solo puede utilizarla un administrador.'
    );
  }

  const parkingLotId = cleanText(user.parkingLotId);

  if (!parkingLotId) {
    throw new HttpsError(
      'failed-precondition',
      'Tu cuenta no tiene una playa asignada.'
    );
  }

  const parkingLotSnapshot = await db
    .collection('parkingLots')
    .doc(parkingLotId)
    .get();

  if (!parkingLotSnapshot.exists) {
    throw new HttpsError(
      'failed-precondition',
      'La playa asignada no existe.'
    );
  }

  const parkingLotData =
    parkingLotSnapshot.data() || {};

  if (parkingLotData.active === false) {
    throw new HttpsError(
      'permission-denied',
      'La playa se encuentra desactivada.'
    );
  }

  return {
    ...user,
    parkingLotId,
  };
}

async function requireParkingLotManager(
  request,
  requestedParkingLotId = null
) {
  const user = await getAuthenticatedProfile(request);

  let parkingLotId = null;

  if (user.role === 'admin') {
    parkingLotId = cleanText(user.parkingLotId);

    if (!parkingLotId) {
      throw new HttpsError(
        'failed-precondition',
        'Tu cuenta no tiene una playa asignada.'
      );
    }

    const requestedId = cleanText(
      requestedParkingLotId
    );

    if (
      requestedId &&
      requestedId !== parkingLotId
    ) {
      throw new HttpsError(
        'permission-denied',
        'No podés administrar otra playa.'
      );
    }
  } else if (user.role === 'platform_admin') {
    parkingLotId = cleanText(
      requestedParkingLotId
    );

    if (!parkingLotId) {
      throw new HttpsError(
        'invalid-argument',
        'Seleccioná una playa válida desde la plataforma.'
      );
    }
  } else {
    throw new HttpsError(
      'permission-denied',
      'Esta función solo puede utilizarla un administrador.'
    );
  }

  const parkingLotSnapshot = await db
    .collection('parkingLots')
    .doc(parkingLotId)
    .get();

  if (!parkingLotSnapshot.exists) {
    throw new HttpsError(
      'not-found',
      'La playa indicada no existe.'
    );
  }

  const parkingLotData =
    parkingLotSnapshot.data() || {};

  if (parkingLotData.active === false) {
    throw new HttpsError(
      'permission-denied',
      'La playa se encuentra desactivada.'
    );
  }

  return {
    ...user,
    parkingLotId,
  };
}

    async function validateUniqueParkingLot({
      name,
      code,
      excludedParkingLotId = null,
    }) {
  const normalizedName =
    normalizeComparableText(name);

  const normalizedCode =
    normalizeParkingLotCode(code);

  const snapshot = await db
    .collection('parkingLots')
    .get();

  for (const document of snapshot.docs) {
    if (
      excludedParkingLotId &&
      document.id === excludedParkingLotId
    ) {
      continue;
    }

    const parkingLotData =
      document.data() || {};

    const existingName =
      normalizeComparableText(
        parkingLotData.name
      );

    const existingCode =
      normalizeParkingLotCode(
        parkingLotData.code
      );

    if (
      existingName &&
      existingName === normalizedName
    ) {
      throw new HttpsError(
        'already-exists',
        'Ya existe una playa con ese nombre.'
      );
    }

    if (
      existingCode &&
      existingCode === normalizedCode
    ) {
      throw new HttpsError(
        'already-exists',
        'Ya existe una playa con ese código.'
      );
    }
  }
}

exports.resolveUsernameLogin = onCall(
  {
    region: REGION,
    maxInstances: 5,
    enforceAppCheck: true,
  },
  async (request) => {
    const username = cleanUsername(
      request.data?.username
    );
    const usernameError =
      getUsernameValidationError(username);

    if (usernameError) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá un usuario válido.'
      );
    }

    const normalizedUsername =
      normalizeUsername(username);

    const registrySnapshot =
      await getUsernameRegistryRef(
        normalizedUsername
      ).get();

    const email = normalizeEmail(
      registrySnapshot.data()?.email
    );

    if (!registrySnapshot.exists || !email) {
      throw new HttpsError(
        'not-found',
        'Usuario o contraseña incorrectos.'
      );
    }

    return { email };
  }
);

async function inspectUsernameRegistry() {
  const usersSnapshot = await db
    .collection('users')
    .limit(201)
    .get();

  if (usersSnapshot.size > 200) {
    throw new HttpsError(
      'failed-precondition',
      'Hay más de 200 usuarios. La preparación debe hacerse por lotes.'
    );
  }

  const entries = [];
  const conflicts = [];
  const ownersByUsername = new Map();

  for (const userSnapshot of usersSnapshot.docs) {
    const userData = userSnapshot.data() || {};
    const username = cleanUsername(userData.username);
    const email = normalizeEmail(userData.email);
    const validationError =
      getUsernameValidationError(username);

    if (validationError || !email) {
      conflicts.push({
        uid: userSnapshot.id,
        username: username || 'Sin usuario',
        reason:
          validationError || 'La cuenta no tiene un email válido.',
      });
      continue;
    }

    const normalizedUsername =
      normalizeUsername(username);
    const previousOwner =
      ownersByUsername.get(normalizedUsername);

    if (previousOwner) {
      conflicts.push({
        uid: userSnapshot.id,
        username,
        reason: `Está repetido con ${previousOwner.username}.`,
      });
      continue;
    }

    ownersByUsername.set(normalizedUsername, {
      uid: userSnapshot.id,
      username,
    });

    entries.push({
      uid: userSnapshot.id,
      username,
      normalizedUsername,
      email,
      profileUsernameNormalized:
        userData.usernameNormalized || '',
      userRef: userSnapshot.ref,
      registryRef:
        getUsernameRegistryRef(normalizedUsername),
    });
  }

  const registrySnapshots = await Promise.all(
    entries.map((entry) => entry.registryRef.get())
  );

  let pending = 0;

  registrySnapshots.forEach((snapshot, index) => {
    const entry = entries[index];
    const registryData = snapshot.data() || {};

    if (
      snapshot.exists &&
      registryData.uid !== entry.uid
    ) {
      conflicts.push({
        uid: entry.uid,
        username: entry.username,
        reason: 'Ya está reservado por otra cuenta.',
      });
      return;
    }

    const registryIsCurrent =
      snapshot.exists &&
      registryData.uid === entry.uid &&
      normalizeEmail(registryData.email) === entry.email &&
      registryData.normalizedUsername ===
        entry.normalizedUsername;

    const profileIsCurrent =
      entry.profileUsernameNormalized ===
        entry.normalizedUsername;

    if (!registryIsCurrent || !profileIsCurrent) {
      pending += 1;
    }
  });

  return {
    entries,
    conflicts,
    pending,
    total: usersSnapshot.size,
  };
}

exports.getUsernameMigrationStatus = onCall(
  {
    region: REGION,
    maxInstances: 2,
    enforceAppCheck: true,
  },
  async (request) => {
    await requirePlatformAdmin(request);

    const inspection =
      await inspectUsernameRegistry();

    return {
      ok: inspection.conflicts.length === 0,
      needed:
        inspection.conflicts.length === 0 &&
        inspection.pending > 0,
      pending: inspection.pending,
      total: inspection.total,
      conflicts: inspection.conflicts,
    };
  }
);

exports.syncUsernameRegistry = onCall(
  {
    region: REGION,
    maxInstances: 1,
    enforceAppCheck: true,
  },
  async (request) => {
    await requirePlatformAdmin(request);

    const inspection =
      await inspectUsernameRegistry();

    const {
      entries,
      conflicts,
      pending,
    } = inspection;

    if (conflicts.length > 0) {
      return {
        ok: false,
        migrated: 0,
        conflicts,
      };
    }

    if (pending === 0) {
      return {
        ok: true,
        migrated: 0,
        conflicts: [],
      };
    }

    return db.runTransaction(
      async (transaction) => {
        const transactionConflicts = [...conflicts];
        const registrySnapshots = await Promise.all(
          entries.map((entry) =>
            transaction.get(entry.registryRef)
          )
        );

        registrySnapshots.forEach((snapshot, index) => {
          const entry = entries[index];

          if (
            snapshot.exists &&
            snapshot.data()?.uid !== entry.uid
          ) {
            transactionConflicts.push({
              uid: entry.uid,
              username: entry.username,
              reason: 'Ya está reservado por otra cuenta.',
            });
          }
        });

        if (transactionConflicts.length > 0) {
          return {
            ok: false,
            migrated: 0,
            conflicts: transactionConflicts,
          };
        }

        entries.forEach((entry) => {
          transaction.set(
            entry.registryRef,
            buildUsernameRegistryDocument(entry),
            { merge: true }
          );

          transaction.set(
            entry.userRef,
            {
              username: entry.username,
              usernameNormalized:
                entry.normalizedUsername,
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
        });

        return {
          ok: true,
          migrated: pending,
          conflicts: [],
        };
      }
    );
  }
);

exports.pingPlatform = onCall(
  {
    region: REGION,
    maxInstances: 2,
  },
  async (request) => {
    const user = await requirePlatformAdmin(request);

    return {
      ok: true,
      message: 'Platform API funcionando',
      userId: user.uid,
      role: user.role,
    };
  }
);

exports.createParkingLotWithAdmin = onCall(
  {
    region: REGION,
    maxInstances: 2,
  },
  async (request) => {
    const platformAdmin =
      await requirePlatformAdmin(request);

    const data = request.data || {};

    const parkingLotId =
      cleanText(data.parkingLotId);

    const name = cleanText(data.name);
    const code =
      normalizeParkingLotCode(data.code);

    const address = cleanText(data.address);

    const timezone =
      cleanText(data.timezone) ||
      'America/Argentina/Buenos_Aires';

    const primaryAdminName =
      cleanText(data.primaryAdminName);

    const contact = cleanText(data.contact);

    const adminUsername =
      cleanUsername(data.adminUsername);

    const adminEmail =
      normalizeEmail(data.adminEmail);

    const adminPassword =
      String(data.adminPassword || '');

    if (!parkingLotId) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá un identificador válido para la playa.'
      );
    }

    if (!/^[a-z0-9-]+$/.test(parkingLotId)) {
      throw new HttpsError(
        'invalid-argument',
        'El identificador de la playa solo puede contener letras minúsculas, números y guiones.'
      );
    }

    if (!name) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá el nombre de la playa.'
      );
    }

    if (!code) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá el código de la playa.'
      );
    }

    if (!timezone) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá una zona horaria válida.'
      );
    }

    validateOptionalText(
      primaryAdminName,
      'El administrador principal',
      100
    );

    validateOptionalText(
      contact,
      'El contacto',
      160
    );

    validateAccountData({
      username: adminUsername,
      email: adminEmail,
      password: adminPassword,
    });

    const adminUsernameNormalized =
      normalizeUsername(adminUsername);

    const parkingLotRef = db
      .collection('parkingLots')
      .doc(parkingLotId);

    const existingParkingLot =
      await parkingLotRef.get();

    if (existingParkingLot.exists) {
      throw new HttpsError(
        'already-exists',
        'Ya existe una playa con ese identificador.'
      );
    }

    await validateUniqueParkingLot({
      name,
      code,
    });

    const createdAuthUser =
      await createFirebaseAuthUser({
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
      });

    const adminUserRef = db
      .collection('users')
      .doc(createdAuthUser.uid);

    const adminUsernameRef =
      getUsernameRegistryRef(
        adminUsernameNormalized
      );

    try {
      await db.runTransaction(
        async (transaction) => {
          const currentParkingLot =
            await transaction.get(parkingLotRef);

          const currentUsername =
            await transaction.get(adminUsernameRef);

          if (currentParkingLot.exists) {
            throw new HttpsError(
              'already-exists',
              'Ya existe una playa con ese identificador.'
            );
          }

          assertUsernameAvailable(
            currentUsername,
            createdAuthUser.uid
          );

          transaction.set(parkingLotRef, {
            name,
            code,
            address,
            timezone,
            primaryAdminName,
            contact,
            active: true,

            createdAt:
              FieldValue.serverTimestamp(),

            updatedAt:
              FieldValue.serverTimestamp(),

            createdBy:
              platformAdmin.username ||
              platformAdmin.email ||
              'Platform admin',

            createdByUid: platformAdmin.uid,

            updatedBy:
              platformAdmin.username ||
              platformAdmin.email ||
              'Platform admin',

            updatedByUid: platformAdmin.uid,
          });

          transaction.set(
            adminUserRef,
            buildUserDocument({
              uid: createdAuthUser.uid,
              username: adminUsername,
              email: adminEmail,
              role: 'admin',
              parkingLotId,
              creator: platformAdmin,
            })
          );

          transaction.set(
            adminUsernameRef,
            buildUsernameRegistryDocument({
              uid: createdAuthUser.uid,
              username: adminUsername,
              normalizedUsername:
                adminUsernameNormalized,
              email: adminEmail,
            })
          );
        }
      );
    } catch (error) {
      console.error(
        'Error guardando playa y administrador:',
        error
      );

      await rollbackAuthUser(
        createdAuthUser.uid
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        'No se pudo completar la creación de la playa.'
      );
    }

    return {
      ok: true,

      parkingLot: {
        id: parkingLotId,
        name,
        code,
        primaryAdminName,
        contact,
      },

      admin: {
        uid: createdAuthUser.uid,
        username: adminUsername,
        email: adminEmail,
        role: 'admin',
        parkingLotId,
      },
    };
  }
);

exports.updateParkingLot = onCall(
  {
    region: REGION,
    maxInstances: 2,
  },
  async (request) => {
    const platformAdmin =
      await requirePlatformAdmin(request);

    const data = request.data || {};

    const parkingLotId =
      cleanText(data.parkingLotId);

    const name =
      cleanText(data.name);

    const code =
      normalizeParkingLotCode(data.code);

    const address =
      cleanText(data.address);

    const timezone =
      cleanText(data.timezone);

    const primaryAdminName =
      cleanText(data.primaryAdminName);

    const contact = cleanText(data.contact);

    if (!parkingLotId) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá un identificador válido para la playa.'
      );
    }

    if (!name) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá el nombre de la playa.'
      );
    }

    if (!code) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá el código de la playa.'
      );
    }

    if (!timezone) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá una zona horaria válida.'
      );
    }

    validateOptionalText(
      primaryAdminName,
      'El administrador principal',
      100
    );

    validateOptionalText(
      contact,
      'El contacto',
      160
    );

    const parkingLotRef = db
      .collection('parkingLots')
      .doc(parkingLotId);

    const parkingLotSnapshot =
      await parkingLotRef.get();

    if (!parkingLotSnapshot.exists) {
      throw new HttpsError(
        'not-found',
        'La playa indicada no existe.'
      );
    }

    await validateUniqueParkingLot({
      name,
      code,
      excludedParkingLotId: parkingLotId,
    });

    try {
      await parkingLotRef.set(
        {
          name,
          code,
          address,
          timezone,
          primaryAdminName,
          contact,

          updatedAt:
            FieldValue.serverTimestamp(),

          updatedBy:
            platformAdmin.username ||
            platformAdmin.email ||
            'Platform admin',

          updatedByUid: platformAdmin.uid,
        },
        { merge: true }
      );
    } catch (error) {
      console.error(
        'Error actualizando playa:',
        error
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        'No se pudo actualizar la playa.'
      );
    }

    return {
      ok: true,

      parkingLot: {
        id: parkingLotId,
        name,
        code,
        address,
        timezone,
        primaryAdminName,
        contact,
      },
    };
  }
);

exports.setParkingLotActive = onCall(
  {
    region: REGION,
    maxInstances: 2,
  },
  async (request) => {
    const platformAdmin =
      await requirePlatformAdmin(request);

    const data = request.data || {};

    const parkingLotId =
      cleanText(data.parkingLotId);

    const active =
      data.active === true;

    if (!parkingLotId) {
      throw new HttpsError(
        'invalid-argument',
        'Ingresá un identificador válido para la playa.'
      );
    }

    const parkingLotRef = db
      .collection('parkingLots')
      .doc(parkingLotId);

    const parkingLotSnapshot =
      await parkingLotRef.get();

    if (!parkingLotSnapshot.exists) {
      throw new HttpsError(
        'not-found',
        'La playa indicada no existe.'
      );
    }

    await parkingLotRef.set(
      {
        active,

        updatedAt:
          FieldValue.serverTimestamp(),

        updatedBy:
          platformAdmin.username ||
          platformAdmin.email ||
          'Platform admin',

        updatedByUid:
          platformAdmin.uid,
      },
      { merge: true }
    );

    return {
      ok: true,
      parkingLotId,
      active,
    };
  }
);

exports.createParkingLotUser = onCall(
  {
    region: REGION,
    maxInstances: 2,
  },
    async (request) => {
      const data = request.data || {};

      const parkingLotManager =
        await requireParkingLotManager(
          request,
          data.parkingLotId
        );

    const username =
      cleanUsername(data.username);

    const email =
      normalizeEmail(data.email);

    const password =
      String(data.password || '');

    const role =
      cleanText(data.role).toLowerCase();

    validateAccountData({
      username,
      email,
      password,
    });

    const usernameNormalized =
      normalizeUsername(username);

    if (!PARKING_LOT_ROLES.includes(role)) {
      throw new HttpsError(
        'invalid-argument',
        'El rol debe ser viewer, user o admin.'
      );
    }

    const createdAuthUser =
      await createFirebaseAuthUser({
        username,
        email,
        password,
      });

    const userRef = db
      .collection('users')
      .doc(createdAuthUser.uid);

    const usernameRef =
      getUsernameRegistryRef(usernameNormalized);

    try {
      await db.runTransaction(
        async (transaction) => {
          const currentUsername =
            await transaction.get(usernameRef);

          assertUsernameAvailable(
            currentUsername,
            createdAuthUser.uid
          );

          transaction.set(
            userRef,
            buildUserDocument({
              uid: createdAuthUser.uid,
              username,
              email,
              role,
              parkingLotId:
                parkingLotManager.parkingLotId,
              creator: parkingLotManager,
            })
          );

          transaction.set(
            usernameRef,
            buildUsernameRegistryDocument({
              uid: createdAuthUser.uid,
              username,
              normalizedUsername:
                usernameNormalized,
              email,
            })
          );
        }
      );
    } catch (error) {
      console.error(
        'Error guardando el perfil del usuario:',
        error
      );

      await rollbackAuthUser(
        createdAuthUser.uid
      );

      if (error instanceof HttpsError) {
        throw error;
      }

      throw new HttpsError(
        'internal',
        'No se pudo completar la creación del usuario.'
      );
    }

    return {
      ok: true,

      user: {
        uid: createdAuthUser.uid,
        username,
        email,
        role,
        parkingLotId:
          parkingLotManager.parkingLotId,
      },
    };
  }
);
