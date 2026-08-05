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
