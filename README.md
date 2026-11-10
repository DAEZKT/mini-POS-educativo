# Mini POS para emprendedores

Mini POS es una aplicación educativa para que un emprendedor gestione su marca, productos, promociones y ventas, y publique un catálogo sencillo. La propuesta de despliegue es que cada emprendedor tenga su propia copia de la app, proyecto Neon y proyecto Vercel.

> **Estado:** documentación de la configuración prevista. Antes de usarla con ventas reales, valida el flujo completo en un proyecto Neon propio, revisa la migración y configura copias de seguridad. Las URL y opciones disponibles pueden variar según el proyecto/branch de Neon.

## Qué incluye

- Inicio de sesión con Neon Auth y dos modos de autorización: personal (propietario único) y SaaS educativo (aprobación por superadmin).
- Datos en PostgreSQL mediante Neon Data API, protegidos con Row Level Security (RLS).
- Configuración de marca: nombre, colores, dirección opcional y teléfono opcional.
- CRUD de productos y clientes; la eliminación exige copiar el nombre y se bloquea si hay ventas o pedidos web vinculados.
- Precio promocional fijo, con interruptor de activación; no tiene fechas ni vencimiento automático.
- Ventas inmediatas con cantidades enteras positivas.
- Historial de ventas con corrección del cliente y anulación auditable que conserva el consecutivo y se excluye del resumen.
- Dashboard e historial de ventas.
- Instalable como PWA en navegadores compatibles para abrir la administración en una ventana propia; no incluye funcionamiento offline.
- Catálogo público con los productos activos.
- Comprobante imprimible y catálogo comercial descargable como PDF, con fotos, ofertas destacadas y productos organizados por categoría.

La primera versión no incluye inventario, compras, proveedores, pagos parciales, variantes de productos ni sucursales. Consulta [el alcance funcional](docs/PRODUCT_SPEC.md).

## Tecnologías y requisitos

- Node.js 20 o posterior y npm.
- Un proyecto/branch de Neon con Neon Auth y Neon Data API habilitados.
- Git y una cuenta de Vercel para el flujo de despliegue explicado en [la guía de despliegue](docs/DEPLOYMENT.md).
- `psql` o el SQL Editor de Neon para aplicar la migración.

## Arranque local

1. Clona o descarga el repositorio y entra en su carpeta.
2. Instala dependencias con `npm install`.
3. Copia `.env.example` a `.env.local`.
4. Configura `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` con las URL que Neon proporciona para la misma branch.
5. Añade `http://localhost:5173` a los orígenes permitidos de Neon Auth.
6. Aplica la migración descrita abajo.
7. Ejecuta `npm run dev` y abre la URL local que indique Vite.

La app de navegador usa las URL públicas de Neon Auth y Neon Data API. **No configures una contraseña SQL en variables `VITE_*`**. `DATABASE_URL` es una credencial administrativa que se usa desde una terminal para migraciones, nunca desde el navegador.

### Instalar en el dispositivo

La app requiere conexión a internet para usar Neon. En Chrome o Edge, abre la raíz de la app y selecciona **Instalar Mini POS** desde el icono de instalación o el menú del navegador. En Android, usa **Instalar aplicación** desde el menú de Chrome. En iPhone o iPad, abre la raíz en Safari y elige **Compartir → Añadir a pantalla de inicio**. El catálogo público conserva su URL compartible y no ofrece la instalación de la consola administrativa.

## Base de datos y migraciones

La migración inicial está en [`database/migrations/202611010001_initial_schema.sql`](database/migrations/202611010001_initial_schema.sql). Se aplica una vez sobre la base/branch correspondiente. Para instrucciones y futuras migraciones, consulta [Despliegue](docs/DEPLOYMENT.md).

## Documentación

- [Guía sencilla: instala con GitHub o desde tu computadora](docs/GUIA_PARA_EMPRENDEDORES.md)
- [Despliegue en Neon y Vercel](docs/DEPLOYMENT.md)
- [Alcance y reglas del producto](docs/PRODUCT_SPEC.md)
- [Seguridad y manejo de datos](docs/SECURITY.md)

## Flujo principal

1. El propietario inicial crea una cuenta y la inicializa como administrador de su instalación. En modo SaaS educativo, el superadmin aprueba las cuentas adicionales.
2. Configura el nombre, colores, dirección y teléfono de su negocio.
3. Registra productos, precios y promociones.
4. Realiza ventas inmediatas.
5. Consulta ventas y productos en el dashboard.
6. Comparte el catálogo público.
7. Imprime el comprobante y descarga el catálogo comercial como PDF.
