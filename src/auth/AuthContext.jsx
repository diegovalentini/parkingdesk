import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { auth, db, firebase } from '../firebase/firebase';
import { normalizeEmail } from '../utils/helpers';

const AuthContext = createContext(null);

function firebaseAuthError(error) {
  const code = error?.code || '';
  if (code.includes('auth/invalid-email')) return 'Email inválido.';
  if (code.includes('auth/user-not-found')) return 'No existe una cuenta con ese email.';
  if (code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) return 'Email o contraseña incorrectos.';
  if (code.includes('auth/email-already-in-use')) return 'Ya existe una cuenta con ese email.';
  if (code.includes('auth/weak-password')) return 'La contraseña debe tener mínimo 6 caracteres.';
  if (code.includes('auth/network-request-failed')) return 'Error de conexión. Revisá internet e intentá de nuevo.';
  return 'No se pudo completar la operación. Intentá de nuevo.';
}

async function getUserProfile(firebaseUser) {
  if (!firebaseUser) return null;
  const ref = db.collection('users').doc(firebaseUser.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    const username = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario';
    const data = {
      uid: firebaseUser.uid,
      username,
      email: normalizeEmail(firebaseUser.email),
      role: 'viewer',
      active: true,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await ref.set(data, { merge: true });
    return { ...data, createdAt: Date.now(), updatedAt: Date.now() };
  }

  const data = snap.data() || {};
  return {
    uid: firebaseUser.uid,
    username: data.username || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Usuario',
    email: data.email || normalizeEmail(firebaseUser.email),
    role: data.role || 'viewer',
    active: data.active !== false,
    ...data,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await getUserProfile(firebaseUser);
        setUser(profile);
      } catch (error) {
        console.error('Error cargando perfil:', error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      await auth.signInWithEmailAndPassword(normalizeEmail(email), password);
      return null;
    } catch (error) {
      console.error(error);
      return firebaseAuthError(error);
    }
  }, []);

  const registerUser = useCallback(async ({ username, email, password }) => {
    const cleanUsername = String(username || '').trim();
    const cleanEmail = normalizeEmail(email);
    if (!cleanUsername) return 'Ingresá un nombre de usuario.';
    if (!cleanEmail) return 'Ingresá un email válido.';
    if (!password || String(password).length < 6) return 'La contraseña debe tener mínimo 6 caracteres.';
    try {
      const credential = await auth.createUserWithEmailAndPassword(cleanEmail, password);
      const firebaseUser = credential.user;
      await firebaseUser.updateProfile({ displayName: cleanUsername });
      await db.collection('users').doc(firebaseUser.uid).set({
        uid: firebaseUser.uid,
        username: cleanUsername,
        email: cleanEmail,
        role: 'viewer',
        active: true,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      return null;
    } catch (error) {
      console.error(error);
      return firebaseAuthError(error);
    }
  }, []);

  const logout = useCallback(async () => {
    await auth.signOut();
  }, []);

  const value = useMemo(() => ({ user, loading, login, registerUser, logout }), [user, loading, login, registerUser, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({ children, adminOnly = false, allowedRoles = null }) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate('/login', { replace: true, state: { from: location.pathname } });
      return;
    }
    if (user.active === false) {
      logout().then(() => navigate('/login', { replace: true }));
      return;
    }
    if (adminOnly && user.role !== 'admin') navigate('/', { replace: true });
    if (Array.isArray(allowedRoles) && !allowedRoles.includes(user.role)) navigate('/', { replace: true });
  }, [adminOnly, allowedRoles, loading, location.pathname, logout, navigate, user]);

  if (loading) return <main className="layout"><p className="muted">Cargando...</p></main>;
  if (!user) return null;
  if (adminOnly && user.role !== 'admin') return null;
  if (Array.isArray(allowedRoles) && !allowedRoles.includes(user.role)) return null;
  return children;
}
