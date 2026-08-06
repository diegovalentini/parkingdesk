import { functions } from '../firebase/firebase';

function cleanText(value) {
  return String(value || '').trim();
}

function normalizeEmail(value) {
  return cleanText(value).toLowerCase();
}

const ALLOWED_ROLES = [
  'viewer',
  'user',
  'admin',
];

function callableErrorMessage(error, fallback) {
  return (
    error?.details ||
    error?.message ||
    fallback
  );
}

export async function getUsernameMigrationStatus() {
  const callable = functions.httpsCallable(
    'getUsernameMigrationStatus'
  );

  try {
    const response = await callable();
    return response.data;
  } catch (error) {
    console.error(
      'Error comprobando usernames existentes:',
      error
    );

    throw new Error(
      callableErrorMessage(
        error,
        'No se pudo comprobar el estado de los usernames.'
      )
    );
  }
}

export async function syncUsernameRegistry() {
  const callable = functions.httpsCallable(
    'syncUsernameRegistry'
  );

  try {
    const response = await callable();
    return response.data;
  } catch (error) {
    console.error(
      'Error preparando usernames existentes:',
      error
    );

    throw new Error(
      callableErrorMessage(
        error,
        'No se pudieron preparar los usuarios existentes.'
      )
    );
  }
}

export async function createParkingLotUser({
  username,
  email,
  password,
  role,
  parkingLotId,
}) {
  const cleanParkingLotId = cleanText(parkingLotId);
  const cleanUsername = cleanText(username);
  const cleanEmail = normalizeEmail(email);
  const cleanPassword = String(password || '');
  const cleanRole = cleanText(role).toLowerCase();

  if (!cleanUsername) {
    throw new Error('Ingresá el nombre del usuario.');
  }

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Ingresá un email válido.');
  }

  if (cleanPassword.length < 6) {
    throw new Error(
      'La contraseña debe tener mínimo 6 caracteres.'
    );
  }

  if (!ALLOWED_ROLES.includes(cleanRole)) {
    throw new Error(
      'Seleccioná un rol válido.'
    );
  }

  const callable = functions.httpsCallable(
    'createParkingLotUser'
  );

  try {
    const response = await callable({
      username: cleanUsername,
      email: cleanEmail,
      password: cleanPassword,
      role: cleanRole,
      parkingLotId: cleanParkingLotId || null,
    });

    return response.data;
  } catch (error) {
    console.error(
      'Error creando usuario de la playa:',
      error
    );

    const message =
      error?.details ||
      error?.message ||
      'No se pudo crear el usuario.';

    throw new Error(message);
  }
}
