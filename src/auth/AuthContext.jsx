import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { auth, db } from '../firebase/firebase';
import {
  USER_ROLES,
  getUserParkingLotId,
  isPlatformAdmin,
} from '../firebase/parkingLotRefs';
import { normalizeEmail } from '../utils/helpers';

const AuthContext = createContext(null);

function firebaseAuthError(error) {
  const code = error?.code || '';

  if (code.includes('auth/invalid-email')) {
    return 'Email inválido.';
  }

  if (code.includes('auth/user-not-found')) {
    return 'No existe una cuenta con ese email.';
  }

  if (
    code.includes('auth/wrong-password') ||
    code.includes('auth/invalid-credential')
  ) {
    return 'Email o contraseña incorrectos.';
  }

  if (code.includes('auth/network-request-failed')) {
    return 'Error de conexión. Revisá internet e intentá de nuevo.';
  }

  return 'No se pudo completar la operación. Intentá de nuevo.';
}

function normalizeParkingLotId(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const cleanValue = value.trim();

  return cleanValue || null;
}

async function getUserProfile(firebaseUser) {
  if (!firebaseUser) {
    return null;
  }

  const ref = db.collection('users').doc(firebaseUser.uid);
  const snap = await ref.get();

  if (!snap.exists) {
    throw new Error(
      'La cuenta existe en Authentication pero no tiene un perfil asociado.'
    );
  }

  const data = snap.data() || {};
  const role = data.role || USER_ROLES.VIEWER;

  return {
    ...data,
    uid: firebaseUser.uid,
    username:
      data.username ||
      firebaseUser.displayName ||
      firebaseUser.email?.split('@')[0] ||
      'Usuario',
    email: data.email || normalizeEmail(firebaseUser.email),
    role,
    active: data.active !== false,

    // La cuenta maestra no pertenece a una playa.
    parkingLotId:
      role === USER_ROLES.PLATFORM_ADMIN
        ? null
        : normalizeParkingLotId(data.parkingLotId),
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

        await auth.signOut();
        setUser(null);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      await auth.signInWithEmailAndPassword(
        normalizeEmail(email),
        password
      );

      return null;
    } catch (error) {
      console.error(error);
      return firebaseAuthError(error);
    }
  }, []);

  const logout = useCallback(async () => {
    await auth.signOut();
  }, []);

  const value = useMemo(() => {
    return {
      user,
      loading,
      login,
      logout,

      // Datos preparados para las rutas multi-playa.
      parkingLotId: getUserParkingLotId(user),
      isPlatformAdmin: isPlatformAdmin(user),
    };
  }, [user, loading, login, logout]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

export function RequireAuth({
  children,
  adminOnly = false,
  allowedRoles = null,
}) {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      navigate('/login', {
        replace: true,
        state: { from: location.pathname },
      });
      return;
    }

    if (user.active === false) {
      logout().then(() => {
        navigate('/login', { replace: true });
      });
      return;
    }

    if (user.role === USER_ROLES.PLATFORM_ADMIN) {
      navigate('/platform', { replace: true });
      return;
    }

    if (adminOnly && user.role !== USER_ROLES.ADMIN) {
      navigate('/', { replace: true });
      return;
    }

    if (
      Array.isArray(allowedRoles) &&
      !allowedRoles.includes(user.role)
    ) {
      navigate('/', { replace: true });
    }
  }, [
    adminOnly,
    allowedRoles,
    loading,
    location.pathname,
    logout,
    navigate,
    user,
  ]);

  if (loading) {
    return (
      <main className="layout">
        <p className="muted">Cargando...</p>
      </main>
    );
  }

  if (!user) {
    return null;
  }

  if (user.role === USER_ROLES.PLATFORM_ADMIN) {
  return null;
}

  if (adminOnly && user.role !== USER_ROLES.ADMIN) {
    return null;
  }

  if (
    Array.isArray(allowedRoles) &&
    !allowedRoles.includes(user.role)
  ) {
    return null;
  }

  return children;
}

export function RequirePlatformAdmin({ children }) {
  const { user, loading, isPlatformAdmin: hasPlatformAccess } =
    useAuth();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!user) {
      navigate('/login', {
        replace: true,
        state: { from: location.pathname },
      });
      return;
    }

    if (!hasPlatformAccess) {
      navigate('/', { replace: true });
    }
  }, [
    hasPlatformAccess,
    loading,
    location.pathname,
    navigate,
    user,
  ]);

  if (loading) {
    return (
      <main className="layout">
        <p className="muted">Cargando...</p>
      </main>
    );
  }

  if (!user || !hasPlatformAccess) {
    return null;
  }

  return children;
}