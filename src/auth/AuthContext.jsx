import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import {
  auth,
  db,
  functions,
} from '../firebase/firebase';
import {
  USER_ROLES,
  getUserParkingLotId,
  isPlatformAdmin,
} from '../firebase/parkingLotRefs';
import { normalizeEmail } from '../utils/helpers';

const AuthContext = createContext(null);

const PLATFORM_PARKING_LOT_SESSION_KEY =
  'parkingdesk_platform_parking_lot';

function firebaseAuthError(error) {
  const code = error?.code || '';

  if (code.includes('auth/invalid-email')) {
    return 'Email inválido.';
  }

  if (code.includes('auth/user-not-found')) {
    return 'Usuario, email o contraseña incorrectos.';
  }

  if (
    code.includes('auth/wrong-password') ||
    code.includes('auth/invalid-credential') ||
    code.includes('functions/not-found') ||
    code.includes('functions/invalid-argument')
  ) {
    return 'Usuario, email o contraseña incorrectos.';
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

async function resolveIdentifierEmail(identifier) {
  const cleanIdentifier =
    String(identifier || '').trim();

  if (!cleanIdentifier) {
    throw new Error('Ingresá tu usuario o email.');
  }

  if (cleanIdentifier.includes('@')) {
    return normalizeEmail(cleanIdentifier);
  }

  const resolveUsername =
    functions.httpsCallable(
      'resolveUsernameLogin'
    );

  const response = await resolveUsername({
    username: cleanIdentifier,
  });

  return normalizeEmail(response.data?.email);
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

  const [
  platformParkingLotId,
  setPlatformParkingLotId,
] = useState(() => {
  return normalizeParkingLotId(
    sessionStorage.getItem(
      PLATFORM_PARKING_LOT_SESSION_KEY
    )
  );
});

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

  const login = useCallback(async (identifier, password) => {
    try {
      const email =
        await resolveIdentifierEmail(identifier);

      await auth.signInWithEmailAndPassword(
        email,
        password
      );

      return null;
    } catch (error) {
      console.error(error);
      return firebaseAuthError(error);
    }
  }, []);

  const resetPassword = useCallback(
    async (identifier) => {
      try {
        const email =
          await resolveIdentifierEmail(identifier);

        auth.languageCode = 'es';
        await auth.sendPasswordResetEmail(email);

        return null;
      } catch (error) {
        console.error(
          'Error solicitando recuperación de contraseña:',
          error
        );

        if (
          error?.code?.includes(
            'auth/network-request-failed'
          )
        ) {
          return firebaseAuthError(error);
        }

        // No revelamos si el usuario o email existe.
        return null;
      }
    },
    []
  );

const logout = useCallback(async () => {
  sessionStorage.removeItem(
    PLATFORM_PARKING_LOT_SESSION_KEY
  );

  setPlatformParkingLotId(null);

  await auth.signOut();
}, []);

  const enterParkingLotAsPlatform = useCallback(
  (parkingLotId) => {
    const normalizedId =
      normalizeParkingLotId(parkingLotId);

    if (!normalizedId) {
      throw new Error(
        'No se recibió una playa válida.'
      );
    }

    sessionStorage.setItem(
      PLATFORM_PARKING_LOT_SESSION_KEY,
      normalizedId
    );

    setPlatformParkingLotId(normalizedId);
  },
  []
);

const exitParkingLotAsPlatform = useCallback(() => {
  sessionStorage.removeItem(
    PLATFORM_PARKING_LOT_SESSION_KEY
  );

  setPlatformParkingLotId(null);
}, []);

  const value = useMemo(() => {
    const hasPlatformAccess =
    isPlatformAdmin(user);

    const effectiveParkingLotId =
    hasPlatformAccess
    ? platformParkingLotId
    : getUserParkingLotId(user);

    return {
      user,
      loading,
      login,
      resetPassword,
      logout,
    
      parkingLotId: effectiveParkingLotId,
      userParkingLotId:
        getUserParkingLotId(user),
    
      isPlatformAdmin: hasPlatformAccess,
      isInspectingParkingLot:
        hasPlatformAccess &&
        Boolean(platformParkingLotId),
    
      platformParkingLotId,
    
      enterParkingLotAsPlatform,
      exitParkingLotAsPlatform,
    };
  }, [
  user,
  loading,
  login,
  resetPassword,
  logout,
  platformParkingLotId,
  enterParkingLotAsPlatform,
  exitParkingLotAsPlatform,
]);

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
  const {
  user,
  loading,
  logout,
  isInspectingParkingLot,
} = useAuth();
  const hasAdminAccess =
    user?.role === USER_ROLES.ADMIN ||
    (
      user?.role === USER_ROLES.PLATFORM_ADMIN &&
      isInspectingParkingLot
    );
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

 if (
  user.role === USER_ROLES.PLATFORM_ADMIN &&
  !isInspectingParkingLot
) {
  navigate('/platform', { replace: true });
  return;
}

    if (adminOnly && !hasAdminAccess) {
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
     isInspectingParkingLot,
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

if (
  user.role === USER_ROLES.PLATFORM_ADMIN &&
  !isInspectingParkingLot
) {
  return null;
}

    if (adminOnly && !hasAdminAccess) {
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
