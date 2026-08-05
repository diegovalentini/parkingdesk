const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getUsernameValidationError,
  normalizeUsername,
  usernameRegistryId,
} = require('../functions/usernameUtils');

test('normaliza mayúsculas, acentos y espacios', () => {
  assert.equal(
    normalizeUsername('  José   Pérez  '),
    'jose perez'
  );
});

test('considera duplicados los nombres equivalentes', () => {
  assert.equal(
    normalizeUsername('DIEGO'),
    normalizeUsername('diego')
  );

  assert.equal(
    normalizeUsername('María López'),
    normalizeUsername('maria   lopez')
  );
});

test('acepta los caracteres definidos para usernames', () => {
  assert.equal(
    getUsernameValidationError('operador_norte-1'),
    null
  );

  assert.equal(
    getUsernameValidationError('Juan.Pérez'),
    null
  );
});

test('rechaza usernames demasiado cortos o con arroba', () => {
  assert.match(
    getUsernameValidationError('ab'),
    /entre 3 y 60/
  );

  assert.match(
    getUsernameValidationError('usuario@email.com'),
    /solo puede contener/
  );
});

test('genera una clave estable y segura para Firestore', () => {
  const first = usernameRegistryId('jose perez');
  const second = usernameRegistryId('jose perez');

  assert.equal(first, second);
  assert.doesNotMatch(first, /\//);
});
