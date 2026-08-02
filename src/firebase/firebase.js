import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function validateFirebaseEnvironment() {
  const hostname = window.location.hostname;
  const projectId = firebaseConfig.projectId;

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1';

  const isDevHosting =
    hostname === 'parkingdeskdev2.web.app' ||
    hostname === 'parkingdeskdev2.firebaseapp.com' ||
    hostname === 'estacion-azul-web-dev.web.app' ||
    hostname === 'estacion-azul-web-dev.firebaseapp.com';

  if (
    (isLocalhost || isDevHosting) &&
    projectId !== 'estacion-azul-web-dev'
  ) {
    throw new Error(
      `Configuración peligrosa bloqueada: ${hostname} está intentando conectarse al proyecto ${projectId}.`
    );
  }
}

validateFirebaseEnvironment();

if (import.meta.env.DEV) {
  console.info(
    `[Firebase] Entorno de desarrollo conectado a: ${firebaseConfig.projectId}`
  );
}

const missingConfigValues = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingConfigValues.length > 0) {
  throw new Error(
    `Faltan variables de configuración Firebase: ${missingConfigValues.join(', ')}`
  );
}

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();

export const functions = firebase.app().functions(
  'southamerica-east1'
);

export { firebase };