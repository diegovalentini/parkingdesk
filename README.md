# ParkingDesk

Aplicación web de gestión de estacionamientos construida con React, Vite y Firebase.

## Instalación

```powershell
npm install
```

## Desarrollo local

```powershell
npm run dev
```

El acceso local a Callable Functions protegidas requiere App Check en modo debug y un token registrado exclusivamente en el proyecto DEV. Nunca se deben versionar ni compartir claves o tokens de depuración.

## Pruebas

```powershell
npm run test:usernames
firebase emulators:exec --only firestore --project estacion-azul-web-dev "npm run test:rules"
```

## Build de DEV

La clave pública DEV de App Check debe estar disponible únicamente durante la compilación.

```powershell
npm run build:dev
```

## Deploy de DEV

El deploy siempre lo ejecuta manualmente el responsable del proyecto. El comando permitido para Hosting DEV debe indicar tanto el target como el proyecto:

```powershell
firebase deploy --only hosting:parkingdeskdev --project estacion-azul-web-dev
```

## Producción

No utilizar comandos genéricos como `firebase deploy` o `firebase deploy --only hosting`.

La promoción a producción debe seguir [PRODUCTION_RELEASE_CHECKLIST.md](PRODUCTION_RELEASE_CHECKLIST.md), aprobar cada punto de control y utilizar la configuración separada `firebase.prod.json`. Codex no ejecuta deploys ni utiliza el proyecto productivo.
