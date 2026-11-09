# Seguridad y datos

## Autenticación y acceso a datos

Neon Auth gestiona registro, inicio de sesión y sesiones. Neon Data API recibe las peticiones del navegador y valida los JWT. La migración `202611080001_installation_access_control.sql` añade el estado de autorización por usuario y los modos `personal` y `saas`. Las políticas RLS y las funciones privilegiadas deben comprobar tanto la autorización aprobada como la propiedad indicada por `auth.user_id()`.

La cuenta administradora inicial se asigna con una acción SQL del propietario de la base de datos. No se debe promover automáticamente al primer usuario que se registre. En modo `personal`, solo administradores aprobados pueden usar la instalación; en modo `saas`, el superadmin debe aprobar cada cuenta antes de que pueda crear o consultar un negocio.

Neon Auth permite registros directos por defecto y no ofrece actualmente una opción integrada para restringirlos. Ocultar **Crear cuenta** es solo una medida de interfaz. La tabla de autorización impide que cuentas no aprobadas usen los datos privados, pero no impide que Neon Auth almacene esas cuentas.

La política de orígenes permitidos de Neon Auth debe incluir los dominios desde los que se usa la app, como `http://localhost:5173` y el dominio publicado. Usa solo los orígenes necesarios.

## Aislamiento por instalación

El modelo previsto es un proyecto Neon por emprendedor/despliegue. Una instalación también puede ejecutarse en modo SaaS educativo, donde el superadmin aprueba varios usuarios. `businesses.owner_user_id` es único, por lo que cada usuario puede tener un solo negocio. RLS sigue siendo obligatorio en ambos modos; no elimines ni debilites las políticas para resolver errores de permisos.

## Catálogo público

El catálogo debe publicarse mediante `get_public_catalog(slug)`, que devuelve solo los campos públicos de marca y productos activos. La migración de control de acceso no añade acceso anónimo a las tablas privadas ni cambia el alcance de esa función. La lectura pública de la tabla completa de negocios, productos, ventas o detalles de venta no debe habilitarse para facilitar el catálogo.

## Registro de ventas

`create_sale(items)` debe requerir una sesión autenticada, comprobar que cada producto activo pertenece al negocio del usuario, validar cantidades enteras positivas y calcular los importes a partir de los precios vigentes en la base de datos. Venta y detalles deben guardarse de forma transaccional para evitar registros parciales.

La migración `202611080002_sales_maintenance.sql` agrega funciones protegidas para corregir el cliente asociado o anular una venta con motivo. La anulación conserva el consecutivo y los detalles; no borra el historial y los reportes excluyen las ventas con estado `voided`. No se permite editar directamente los productos, cantidades ni precios de una venta existente.

## Variables y credenciales

- `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` son direcciones de servicios que necesita el cliente web; no son contraseñas SQL.
- `DATABASE_URL` permite conectarse directamente a PostgreSQL. Trátala como secreto administrativo y úsala solo desde una terminal o herramienta segura para migraciones.
- No pongas contraseñas SQL, claves administrativas ni tokens secretos en variables `VITE_*`, el bundle web o Git.
- No subas `.env.local` ni credenciales al repositorio.
- Si una credencial administrativa se expone, rótala desde Neon.

## Responsabilidad de quien despliega

Quien mantiene cada instalación administra sus cuentas, datos, dominio, credenciales, respaldos y migraciones. Debe conservar acceso a Neon, revisar actualizaciones y probar que puede restaurar los respaldos.
