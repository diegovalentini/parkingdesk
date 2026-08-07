# ParkingDesk - checklist de promoción a producción

Estado del documento: **preparación solamente**. Ningún paso productivo debe ejecutarse hasta aprobar expresamente la fase correspondiente.

## Alcance de la versión

- Base productiva confirmada funcionalmente el 07/08/2026: `b2944b1` (`master`) más el hotfix de corrección del método de pago representado por `51f168f`.
- Versión candidata: `354ccc8` (`feature/platform-admin`).
- Commits incluidos, en orden:
  1. `d03a9aa` - acceso de `platform_admin` a las playas.
  2. `f8405a6` - hotfix del método de pago.
  3. `0f7afea` - permisos y pruebas de reglas.
  4. `b572303` - mejoras de Platform y acceso por username.
  5. `bd845dd` - buscador y App Check.
  6. `354ccc8` - preparación automática del registro de usernames.

## Reglas innegociables

- Codex no ejecuta deploys ni utiliza el proyecto productivo.
- El operador humano ejecuta cada paso productivo de manera manual y confirma su resultado antes de avanzar.
- No se borran colecciones ni documentos, tampoco durante un rollback.
- No se leen, muestran ni versionan archivos `.env.*.local`, credenciales o cuentas de servicio.
- No se hace commit ni push sin autorización expresa.
- Durante la ventana de promoción no se crean usuarios ni playas.
- Producción permanece operativa durante la preparación local. Ningún paso productivo se ejecuta hasta acordar expresamente una ventana de baja actividad.
- Si una verificación falla, se detiene la promoción. No se continúa esperando que el siguiente paso lo arregle.

## Bloqueadores antes de comenzar

- [x] Confirmar la base productiva: login por email, Platform básico y hotfix de corrección del método de pago activo.
- [x] Aislar el Hosting productivo con `firebase.prod.json` y el target local `parkingdeskprod`; `firebase.json` y `parkingdeskdev` quedan reservados para DEV.
- [ ] Limpiar los espacios finales detectados al comparar `master...feature/platform-admin` y volver a ejecutar `git diff --check master...HEAD`.
- [ ] Confirmar acceso por email a una cuenta `platform_admin` de producción. El primer acceso no debe depender del username.
- [ ] Confirmar que todos los perfiles productivos tienen `username` y un email válido, sin modificar todavía ningún documento.
- [ ] Acordar una ventana corta de baja actividad, sin creación de usuarios ni playas y con una persona disponible para las pruebas inmediatas.
- [ ] El responsable de infraestructura debe confirmar que existe un mecanismo externo de recuperación vigente. Codex no toca backups.

## Evidencia local ya obtenida

- [x] Sintaxis de `functions/index.js` válida.
- [x] Pruebas de usernames: 5/5.
- [x] Pruebas de reglas Firestore: 10/10 usando el emulador y el proyecto DEV.
- [x] Pruebas manuales en DEV por rol.
- [x] Login por username y por email probado en DEV.
- [x] Recuperación de contraseña probada en DEV.
- [x] App Check válido en DEV después de compilar Hosting con su clave.

## Fase 1 - Preparar App Check productivo

- [ ] Registrar exclusivamente la app web productiva en Firebase App Check.
- [ ] Crear o seleccionar una clave reCAPTCHA Enterprise basada en puntuación para los dominios productivos.
- [ ] Verificar que todos los dominios reales de Hosting estén autorizados.
- [ ] Guardar la clave pública de sitio fuera de Git.
- [ ] No activar todavía enforcement general para Firestore o Authentication. Esta versión solo exige App Check en las Callable Functions de usernames.
- [ ] Confirmar que la app figura como registrada antes de desplegar código.

**Punto de control:** detenerse si la app, la clave o los dominios pertenecen a un proyecto distinto.

## Fase 2 - Publicar solamente las Functions nuevas de usernames

Funciones nuevas:

- `resolveUsernameLogin`
- `getUsernameMigrationStatus`
- `syncUsernameRegistry`

Estas tres Functions exigen App Check. El frontend productivo anterior no las utiliza, por lo que publicarlas primero no debería alterar el acceso existente.

- [ ] Revisar que el comando manual contenga explícitamente solo las tres Functions y el identificador productivo correcto.
- [ ] Ejecutarlo una sola vez desde una terminal situada en la raíz del repositorio.
- [ ] Confirmar que las tres operaciones finalizan correctamente.
- [ ] No desplegar todavía `createParkingLotUser` ni `createParkingLotWithAdmin`.

**Punto de control:** la web productiva anterior debe seguir permitiendo el acceso por email y el trabajo habitual.

## Fase 3 - Publicar y verificar reglas Firestore

- [ ] Revisar el diff exacto de `firestore.rules` contra la versión productiva confirmada.
- [ ] Publicar únicamente las reglas Firestore.
- [ ] Probar inmediatamente con la web todavía anterior:
  - viewer: lectura de su playa, sin escrituras;
  - user: operación de plazas y creación de logs de su playa;
  - user: corrección del método de pago con auditoría;
  - admin: administración limitada a su propia playa;
  - accesos a otras playas: rechazados.

**Punto de control:** si cualquier rol pierde una operación legítima, restaurar las reglas anteriores y detener la promoción.

## Fase 4 - Compilar y publicar Hosting

- [x] Usar `firebase.prod.json` y el target `parkingdeskprod`; no usar `firebase.json` para publicar Hosting productivo.
- [ ] Cargar la clave pública productiva de App Check únicamente para el proceso de compilación.
- [ ] Ejecutar el build de producción.
- [ ] Verificar que el build no muestre avisos de configuración Firebase o App Check ausente.
- [ ] Revisar que el destino manual corresponda inequívocamente al sitio productivo.
- [ ] Publicar solamente Hosting.
- [ ] Retirar la variable temporal de App Check de la terminal.
- [ ] Abrir la web en una ventana privada para evitar caché.

Pruebas inmediatas:

- [ ] Login de `platform_admin` por email.
- [ ] Login de un usuario normal por email.
- [ ] Navegación básica de ambos roles.
- [ ] App Check muestra solicitudes válidas para `resolveUsernameLogin`.

**Punto de control:** el acceso por email es la vía de recuperación durante la migración. Si falla, restaurar la versión anterior de Hosting.

## Fase 5 - Preparar los usernames existentes

- [ ] Entrar a Platform con el email del `platform_admin`.
- [ ] Confirmar que aparece `Preparar usuarios` solo si hay registros pendientes.
- [ ] Ejecutar la preparación una sola vez.
- [ ] Confirmar que no se informa ningún conflicto.
- [ ] Registrar el total informado y compararlo con la cantidad esperada de usuarios.
- [ ] Confirmar que el botón desaparece después de completar la operación.
- [ ] Probar login por username para una cuenta de cada rol.
- [ ] Probar también login por email y recuperación de contraseña.

La migración añade documentos privados en `usernames` y el campo `usernameNormalized`; no elimina ni reemplaza cuentas de Authentication.

**Punto de control:** ante un conflicto de username no se corrigen datos manualmente durante la ventana. Se detiene la promoción y se analiza el caso.

## Fase 6 - Publicar las Functions existentes modificadas

Functions modificadas:

- `createParkingLotWithAdmin`
- `updateParkingLot`
- `createParkingLotUser`

- [ ] Publicar únicamente estas tres Functions.
- [ ] Crear un usuario controlado y confirmar que puede entrar por username.
- [ ] Confirmar que un username equivalente o duplicado es rechazado.
- [ ] Crear o editar una playa controlada y comprobar administrador principal y contacto.
- [ ] Confirmar que activar/desactivar una playa continúa funcionando.

No es necesario volver a publicar `pingPlatform` ni `setParkingLotActive` si su código productivo confirmado no difiere.

## Fase 7 - Verificación final

- [ ] `platform_admin` entra a cualquier playa y conserva las operaciones previstas.
- [ ] admin permanece limitado a su `parkingLotId`.
- [ ] user y viewer conservan su matriz de permisos.
- [ ] El historial permite la corrección válida del método de pago.
- [ ] La búsqueda de playas funciona.
- [ ] Crear, editar y activar/desactivar playas funciona.
- [ ] Crear usuarios y rechazar usernames duplicados funciona.
- [ ] Login por username, login por email y recuperación funcionan.
- [ ] App Check informa tokens válidos y no hay errores repetidos en Functions.
- [ ] Observar el sistema durante la ventana acordada antes de dar por cerrada la versión.

## Rollback sin borrar datos

- Hosting: restaurar desde Firebase Hosting la versión publicada inmediatamente anterior.
- Reglas: volver a publicar el archivo de reglas correspondiente a la base productiva confirmada.
- Functions existentes: volver a publicar sus versiones anteriores desde la base productiva confirmada.
- Functions nuevas de usernames: pueden quedar publicadas sin uso si el Hosting anterior no las llama.
- Datos añadidos por la migración (`usernames`, `usernameNormalized`, metadatos de playas): no borrarlos. Son aditivos y el código anterior puede ignorarlos.
- Después de cualquier rollback, probar primero login por email y las operaciones críticas de una playa.

## Cierre de la promoción

- [ ] Registrar fecha, versión publicada y resultado de cada punto de control.
- [ ] Confirmar que no quedó ninguna terminal con variables temporales.
- [ ] Mantener el commit base y el commit publicado claramente identificados.
- [ ] No borrar registros creados por la migración.
