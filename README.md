# Estacionamiento Azul React + Vite

Migración inicial desde HTML/CSS/JS puro a React + Vite.

## Instalar

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy Firebase Hosting

Si ya tenés Firebase CLI configurado:

```bash
npm run build
firebase deploy --only hosting
```

## Notas

- Se mantiene la estética copiando `styles.css`.
- Se mantiene Firebase compat para no cambiar demasiado la lógica original.
- La Black List y el reporte mensual se conservaron con la lógica localStorage que traían los JS originales.
- Las reglas de Firestore no se modificaron en esta migración.
