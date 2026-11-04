# Seguridad y datos

## Autenticación y acceso a datos

Neon Auth gestiona registro, inicio de sesión y sesiones. Neon Data API recibe las peticiones del navegador y valida los JWT. Las tablas de negocio deben conservar RLS y sus políticas, que limitan los datos del negocio a la cuenta propietaria indicada por `auth.user_id()`.

La política de orígenes permitidos de Neon Auth debe incluir los dominios desde los que se usa la app, como `http://localhost:5173` y el dominio publicado. Usa solo los orígenes necesarios.

## Aislamiento por instalación

El modelo previsto es un proyecto Neon por emprendedor/despliegue. RLS sigue siendo importante: dentro de un proyecto, restringe los registros al usuario propietario del negocio. No elimines ni debilites las políticas RLS para resolver errores de permisos.

## Catálogo público

El catálogo debe publicarse mediante `get_public_catalog(slug)`, que devuelve solo los campos públicos de marca y productos activos. La lectura pública de la tabla completa de negocios, productos, ventas o detalles de venta no debe habilitarse para facilitar el catálogo.

## Registro de ventas

`create_sale(items)` debe requerir una sesión autenticada, comprobar que cada producto activo pertenece al negocio del usuario, validar cantidades enteras positivas y calcular los importes a partir de los precios vigentes en la base de datos. Venta y detalles deben guardarse de forma transaccional para evitar registros parciales.

## Variables y credenciales

- `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` son direcciones de servicios que necesita el cliente web; no son contraseñas SQL.
- `DATABASE_URL` permite conectarse directamente a PostgreSQL. Trátala como secreto administrativo y úsala solo desde una terminal o herramienta segura para migraciones.
- No pongas contraseñas SQL, claves administrativas ni tokens secretos en variables `VITE_*`, el bundle web o Git.
- No subas `.env.local` ni credenciales al repositorio.
- Si una credencial administrativa se expone, rótala desde Neon.

## Responsabilidad de quien despliega

Quien mantiene cada instalación administra sus cuentas, datos, dominio, credenciales, respaldos y migraciones. Debe conservar acceso a Neon, revisar actualizaciones y probar que puede restaurar los respaldos.
