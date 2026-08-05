const MIN_USERNAME_LENGTH = 3;
const MAX_USERNAME_LENGTH = 60;

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeUsername(value) {
  return cleanUsername(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function getUsernameValidationError(value) {
  const username = cleanUsername(value);
  const normalizedUsername = normalizeUsername(username);

  if (!username) {
    return 'Ingresá el nombre del usuario.';
  }

  if (
    normalizedUsername.length < MIN_USERNAME_LENGTH ||
    normalizedUsername.length > MAX_USERNAME_LENGTH
  ) {
    return `El usuario debe tener entre ${MIN_USERNAME_LENGTH} y ${MAX_USERNAME_LENGTH} caracteres.`;
  }

  if (!/^[a-z0-9._ -]+$/.test(normalizedUsername)) {
    return 'El usuario solo puede contener letras, números, espacios, puntos, guiones y guiones bajos.';
  }

  return null;
}

function usernameRegistryId(normalizedUsername) {
  return Buffer.from(normalizedUsername, 'utf8')
    .toString('base64url');
}

module.exports = {
  cleanUsername,
  getUsernameValidationError,
  normalizeUsername,
  usernameRegistryId,
};
