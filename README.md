# 🅿️ ParkingDesk

ParkingDesk es una aplicación web para la gestión operativa de estacionamientos.

Está diseñada para que operadores y administradores puedan controlar las plazas, registrar entradas y salidas de vehículos, gestionar cobros y consultar el historial de movimientos desde una interfaz rápida y sencilla.

El sistema utiliza una arquitectura multi-estacionamiento, permitiendo administrar diferentes playas de forma independiente dentro de una misma plataforma.

---

## Funcionalidades principales

### Gestión de plazas

- Visualización en tiempo real del estado de cada plaza.
- Plazas para autos y motos.
- Registro de patente y tipo de vehículo.
- Entrada y salida de vehículos.
- Movimiento de vehículos entre plazas.
- Bloqueo y desbloqueo de plazas.
- Registro de llaves.
- Control de hora de entrada.

### Cobros

- Registro del importe cobrado.
- Métodos de pago Efectivo y Mercado Pago.
- Identificación del usuario que abrió y cerró cada operación.
- Posibilidad de corregir el método de pago según los permisos del usuario.

### Historial y reportes

- Historial diario de movimientos.
- Búsqueda por patente y usuario.
- Reportes por día.
- Reportes mensuales.
- Resumen de caja por usuario.
- Exportación de reportes en PDF.

### Blacklist

Permite registrar vehículos que requieren atención especial y advertir al operador cuando intenta ingresar una patente incluida en la lista.

### Usuarios y permisos

ParkingDesk dispone de diferentes niveles de acceso:

- **Viewer:** acceso de consulta.
- **User:** operación diaria del estacionamiento.
- **Admin:** administración del estacionamiento y sus usuarios.
- **Platform Admin:** administración general de ParkingDesk y acceso a las distintas playas.

Cada usuario pertenece a su estacionamiento y los datos se mantienen separados mediante la arquitectura multi-playa.

---

## Plataforma multi-estacionamiento

Los datos de cada estacionamiento se encuentran aislados dentro de su propia estructura:

```text
parkingLots/
  ├── estacionamiento-a/
  │   ├── spots/
  │   ├── logs/
  │   ├── blacklist/
  │   └── settings/
  │
  └── estacionamiento-b/
      ├── spots/
      ├── logs/
      ├── blacklist/
      └── settings/