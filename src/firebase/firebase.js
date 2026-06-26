import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyA1o8idJNKCMhqRcxcCEbcFM8EbpDOptiI",
  authDomain: "estacion-azul-web.firebaseapp.com",
  projectId: "estacion-azul-web",
  storageBucket: "estacion-azul-web.firebasestorage.app",
  messagingSenderId: "133984162110",
  appId: "1:133984162110:web:3af429fbe5f9a32e489c6f"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export const auth = firebase.auth();
export const db = firebase.firestore();
export { firebase };
