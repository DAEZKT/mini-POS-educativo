# Despliegue en Neon y Vercel

Esta guía describe el despliegue previsto: la aplicación estática en Vercel y PostgreSQL, autenticación y API de datos en Neon. Cada emprendedor administra su propia instalación y sus cuentas. No se comparte una base de datos central entre emprendedores.

> **Antes de producción:** completa primero el despliegue de prueba y recorre registro, configuración de marca, producto, promoción, venta, dashboard, catálogo y comprobante. Esta guía no sustituye la validación con un proyecto Neon real, la revisión de seguridad ni una política de respaldos.

La aplicación utiliza `@neondatabase/neon-js` para Neon Auth y Neon Data API. El SDK incluye un adaptador compatible con la interfaz de consultas usada por la app. Neon Data API valida los JWT de Neon Auth y RLS limita las operaciones sobre las tablas. Consulta también la [documentación del SDK de Neon](https://github.com/neondatabase/neon-js) y la [guía de Neon Auth para React](https://github.com/neondatabase/neon-js/blob/main/skills/neon-auth-react/SKILL.md).

## 1. Preparar Neon

1. Crea un proyecto Neon bajo una cuenta que controles y selecciona la branch que utilizará la app.
2. Habilita Neon Auth y Neon Data API para esa branch.
3. Configura el método de acceso por correo y contraseña según las opciones disponibles en Neon Auth.
4. Añade `http://localhost:5173` a los orígenes permitidos para desarrollo. Más adelante añade el dominio de producción de Vercel.
5. Copia las URL de Neon Auth y Neon Data API que aparecen en la configuración de la branch. En la app, corresponden a `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL`. Usa los valores completos proporcionados por Neon; deben apuntar a la misma branch.
6. Obtén la cadena de conexión PostgreSQL de esa branch para aplicar migraciones desde `psql` o una herramienta administrativa. Guárdala localmente como `DATABASE_URL`.

Neon Auth administra sus propias tablas de identidad. La migración de esta app no debe crear ni modificar el esquema interno de Neon Auth.

## 2. Aplicar la migración inicial

La migración inicial se encuentra en `database/migrations/202611010001_initial_schema.sql`. Léela antes de aplicarla y confirma que la conexión apunta al proyecto, branch y base esperados.

En PowerShell, después de definir `DATABASE_URL` en la sesión:

```powershell
psql "$env:DATABASE_URL" -v ON_ERROR_STOP=1 -f .\database\migrations\202611010001_initial_schema.sql
```

En macOS/Linux:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f database/migrations/202611010001_initial_schema.sql
```

También puedes ejecutar el contenido desde el SQL Editor de Neon. Aplica esta migración inicial solo una vez en una base vacía. El repositorio mantiene los archivos SQL versionados; quien despliega debe registrar qué archivos aplicó. No vuelvas a aplicar la inicial sobre un esquema existente.

La migración instala las tablas de negocio, restricciones, RLS y funciones SQL usadas para consultar el catálogo público y confirmar una venta. Depende de la configuración de Neon Auth/Data API y de los roles y funciones que Neon expone en ese entorno; confirma esos requisitos con la migración y prueba su ejecución en una branch de desarrollo antes de producción.

### Control de acceso: modo personal y modo SaaS educativo

La migración `database/migrations/202611080001_installation_access_control.sql` añade el control de acceso para toda la instalación. Inclúyela al final de la secuencia de migraciones, después de `202611070005_link_customers_to_sales.sql`. No edites ni vuelvas a ejecutar migraciones anteriores.

Para conservar las ventas como un historial auditable, aplica después `database/migrations/202611080002_sales_maintenance.sql`. Agrega corrección del cliente asociado y anulación con motivo. Anular no elimina la fila ni reutiliza el consecutivo; las ventas anuladas permanecen en el historial y se excluyen del resumen. La edición de cliente conserva productos, precios e importe original; una corrección monetaria se registra anulando la venta y creando otra.

Después aplica `database/migrations/202611080003_confirmed_record_deletion.sql` para habilitar la eliminación de productos y clientes no usados. La app exige copiar y pegar el nombre exacto; Neon repite esa comprobación y bloquea la eliminación si hay una venta o pedido web vinculado. Las ventas y pedidos conservan sus referencias históricas.

Aplica también `database/migrations/202611090001_reject_installation_access.sql` para distinguir solicitudes rechazadas de cuentas aprobadas cuyo acceso se revocó. En **Accesos**, las pendientes ofrecen **Aprobar** y **Rechazar**; las aprobadas ofrecen **Revocar acceso**; las rechazadas pueden volver a pendiente con **Reconsiderar**.

- **Personal** es el modo predeterminado. Solo el usuario inicial registrado explícitamente como administrador puede usar la app. Después de inicializar la instalación, el formulario de registro se oculta. Las cuentas creadas directamente en Neon Auth no pueden crear un negocio ni consultar datos privados.
- **SaaS educativo** permite que una cuenta se registre y solicite acceso. El superadministrador la aprueba desde **Accesos**. Cada cuenta aprobada recibe su propio negocio; `owner_user_id` mantiene la relación de un usuario por negocio.
- El catálogo y el envío de pedidos permanecen públicos; las políticas de aprobación protegen las funciones privadas de administración.

Neon Auth todavía permite crear cuentas directamente, incluso cuando la app oculta el registro. Por tanto, el modo personal controla el uso de la aplicación y sus datos, pero no evita que Neon Auth almacene cuentas que no han sido autorizadas. Para impedir esas altas en el proveedor se necesita un servicio de autenticación con registro restringido.

#### Inicializar el administrador propietario

1. Despliega la app con las variables de Neon y abre la pantalla de acceso. Antes de inicializar, **Crear cuenta** estará disponible para que el propietario registre su cuenta inicial.
2. Confirma el correo si Neon Auth lo solicita. No compartas el enlace público hasta completar el paso siguiente. Aunque otra persona cree una cuenta antes, no obtendrá acceso a los datos ni podrá convertirse en administradora.
3. Desde el SQL Editor conectado a la branch correcta, identifica el ID de la cuenta que será propietaria:

   ```sql
   select id, email from neon_auth."user" order by "createdAt";
   ```

4. Verifica el correo/ID y ejecuta como propietario de la base de datos, sustituyendo el UUID por el ID confirmado:

   ```sql
   insert into public.installation_access (user_id, email, status, role, reviewed_at)
   values ('UUID_CONFIRMADO', 'propietario@ejemplo.com', 'approved', 'admin', now())
   on conflict (user_id) do update
   set email = excluded.email, status = 'approved', role = 'admin', reviewed_at = now();

   update public.installation_settings
   set access_mode = 'personal', initialized = true, updated_at = now()
   where singleton;
   ```

5. Cierra sesión y vuelve a entrar. La cuenta administradora podrá crear su negocio; en modo personal, las cuentas de rol `owner` sin el rol administrador no tienen acceso.

No uses una regla automática de “primer usuario registrado = admin”. La promoción de administrador debe hacerse con acceso SQL de propietario o con una acción posterior autorizada por el superadmin. Si pierdes el acceso administrativo, el dueño de Neon puede restaurar el rol desde SQL.

#### Aprobar cuentas en modo SaaS educativo

1. El administrador entra a **Accesos** y cambia el modo a **SaaS educativo**.
2. La pantalla de registro queda disponible. Cuando una cuenta inicia sesión, se registra como pendiente y no recibe acceso a tablas ni funciones privadas.
3. En **Accesos**, el administrador revisa la cuenta y pulsa **Aprobar**. El usuario vuelve a iniciar sesión y la app crea su negocio privado.
4. El administrador puede revocar una cuenta desde esa misma pantalla. La revocación bloquea futuras lecturas y escrituras privadas; no borra automáticamente sus registros, que deben respaldarse o eliminarse deliberadamente.

El correo que aparece en la lista ayuda a reconocer la solicitud; el permiso está vinculado al ID de usuario de Neon Auth. No compartas credenciales de superadministrador.

#### Migrar una instalación ya existente

La nueva migración conserva los propietarios actuales como usuarios aprobados, pero no promueve a ninguno automáticamente a administrador. Antes de publicar la nueva app, identifica al responsable y asígnale el rol `admin` con el procedimiento anterior. Si la instalación existente debe seguir permitiendo a sus negocios actuales, selecciona **SaaS educativo** antes de volver a abrirla; si solo la usará su propietario, conserva **Personal**. En modo personal, únicamente los usuarios aprobados con rol de administrador pueden entrar.

### Añadir imágenes de producto a una instalación existente

Después de desplegar la versión que incluye imágenes, aplica una sola vez `database/migrations/202611040001_product_images.sql` en el SQL Editor de Neon, conectado a la misma branch configurada en Vercel. Esta migración agrega `products.image_url` y actualiza la función del catálogo público; no vuelvas a ejecutar la migración inicial.

Para habilitar categorías, aplica después `database/migrations/202611040002_product_categories.sql` una sola vez en esa misma branch. Crea las categorías por negocio, agrega la relación opcional desde productos y actualiza el catálogo público para devolver el nombre de categoría. Si preparas una instalación nueva, aplica las migraciones en orden: inicial, imágenes y categorías.

Para configurar la presentación de moneda, aplica `database/migrations/202611050001_business_currency.sql` y después `database/migrations/202611050003_business_currency_symbol.sql` una sola vez en la misma branch. El emprendedor escribe el símbolo o etiqueta a mostrar (por ejemplo `C$`, `$`, `US$` o `MXN`) desde **Mi negocio**. Esto solo cambia cómo se presentan los importes; no convierte ni recalcula los valores numéricos guardados. Para instalaciones nuevas, aplica estas migraciones después de la de categorías.

Para aceptar pedidos desde el catálogo público, aplica `database/migrations/202611050004_public_catalog_orders.sql` después de las migraciones de categorías y símbolo de moneda. Esto crea las tablas de clientes, pedidos y detalle, y habilita el RPC público que registra solicitudes con los precios calculados desde la base. Luego despliega la app actualizada. Cada negocio debe guardar en **Mi negocio → WhatsApp del negocio** un teléfono con código de país (por ejemplo `+505...`). El catálogo usa el enlace gratuito `wa.me`: registra el pedido como pendiente y prepara un mensaje que el cliente debe confirmar en WhatsApp; no usa WhatsApp Cloud API ni envía mensajes automáticamente.

## 3. Ejecutar localmente

1. Instala Node.js 20 o posterior y npm.
2. Desde la raíz del repositorio, instala dependencias:

   ```bash
   npm install
   ```

3. Copia `.env.example` a `.env.local` y completa:

   ```dotenv
   VITE_NEON_AUTH_URL=https://.../neondb/auth
   VITE_NEON_DATA_API_URL=https://.../neondb/rest/v1
   ```

   Usa las URL exactas que muestra Neon. No inventes ni combines URL de branches distintas.

4. Asegúrate de que Neon Auth permita `http://localhost:5173`.
5. Inicia la app:

   ```bash
   npm run dev
   ```

6. En modo personal, registra la cuenta del propietario, inicialízala como administrador con el procedimiento anterior y después prueba el flujo. Para probar aprobaciones, cambia una instalación de prueba a modo SaaS educativo.

No guardes datos reales en un entorno de prueba. Mantén `.env.local` fuera de Git.

## 4. Publicar en Vercel

1. Sube el repositorio a una cuenta Git que controles.
2. En Vercel, importa el repositorio como un proyecto nuevo.
3. Añade estas variables para Production, y para Preview solo si vas a utilizar esos despliegues:

   - `VITE_NEON_AUTH_URL`
   - `VITE_NEON_DATA_API_URL`
- `VITE_TURNSTILE_SITE_KEY` (sitekey pública de Cloudflare Turnstile)

   Ambas deben corresponder a la misma branch de Neon.

4. Despliega la aplicación. En una instalación nueva, completa el procedimiento de inicialización del administrador antes de compartir la URL.
5. Añade el dominio de Vercel a los orígenes/dominios permitidos en Neon Auth.
6. Vuelve a desplegar si cambiaste variables de entorno y comprueba registro, inicio de sesión y las funciones principales desde el dominio publicado.

### Preparar imágenes de producto

1. En el proyecto de Vercel, abre **Storage → Create Database → Blob** y crea un store con acceso **Public**. Las imágenes del catálogo deben poder leerse sin iniciar sesión.
2. Conecta el store al proyecto y habilita Production y Preview si usarás ambos entornos. Vercel agregará `BLOB_READ_WRITE_TOKEN` automáticamente; mantenlo como secreto de servidor y no crees una variable `VITE_*` para ese token.
3. Aplica `database/migrations/202611040001_product_images.sql` en Neon antes de publicar la nueva versión de la app.
4. Despliega para que la función `/api/product-image-upload` quede activa con el token del store y la app pueda guardar `image_url`.
5. No hace falta una variable nueva en Neon ni otra URL en Vercel. La subida valida la sesión contra Neon Data API; la base guarda la URL pública de cada archivo. Luego sube una imagen JPG, PNG o WebP de hasta 5 MB desde el formulario de producto.

La subida desde `npm run dev` no incluye la función `/api` de Vercel. Para probar la subida usa un Preview desplegado en Vercel (o `vercel dev` con el proyecto vinculado y `BLOB_READ_WRITE_TOKEN` disponible). Los archivos son públicos por URL porque aparecen en catálogos compartibles. Vercel Blob puede generar cargos según almacenamiento, operaciones y tráfico; revisa el uso del store.

`DATABASE_URL` sirve para tareas administrativas de PostgreSQL y migraciones. No la agregues como variable `VITE_*`, no la incluyas en el código cliente y no la subas al repositorio. El cliente web utiliza las URL de Auth y Data API; RLS y las funciones SQL controlan el acceso a los datos.

### Pedidos del catálogo público y protección anti-bots

1. En Cloudflare Turnstile crea un widget para los dominios de producción y Preview que usarás. Su sitekey es pública; su secret key es privada.
2. En Vercel configura `VITE_TURNSTILE_SITE_KEY` con la sitekey y `TURNSTILE_SECRET_KEY` con la secret key. No uses el prefijo `VITE_` para la clave secreta.
3. Agrega `DATABASE_URL` como variable secreta de servidor en Vercel. Copia la conexión PostgreSQL de la branch correcta de Neon; nunca la expongas al navegador ni la pongas en `.env.example`.
4. Aplica las migraciones de pedidos, clientes, ventas y control de acceso en orden y en esa misma branch: `202611050004_public_catalog_orders.sql`, `202611060001_public_order_details.sql`, `202611070001_accept_google_maps_query_urls.sql`, `202611070002_public_orders_to_sales.sql`, `202611070003_manual_customer_management.sql`, `202611070004_preserve_customers_and_confirm_order_completion.sql`, `202611070005_link_customers_to_sales.sql`, `202611080001_installation_access_control.sql`, `202611080002_sales_maintenance.sql`, `202611080003_confirmed_record_deletion.sql` y `202611090001_reject_installation_access.sql`.
5. Despliega de nuevo. El formulario comprueba el reto en el servidor antes de crear un pedido; la función de Neon ya no acepta llamadas públicas directas.
6. El cliente puede indicar dirección y opcionalmente compartir un enlace HTTPS de Google Maps. El producto admite una etiqueta opcional de variante/presentación. Ambos datos quedan guardados como información del cliente/pedido y se incluyen en el texto preparado para WhatsApp.

Turnstile frena envíos automatizados, pero no impone por sí solo un límite de solicitudes por IP. Si el sitio recibe ataques sostenidos, configura además una regla de limitación de tráfico en Vercel o Cloudflare.

Al aplicar `202611070002_public_orders_to_sales.sql`, todo pedido web que pase a estado completado se registra una sola vez en Ventas, con un consecutivo de venta nuevo y una referencia al número original del pedido. La migración también incluye en Ventas los pedidos que ya estaban completados.

Al aplicar `202611070003_manual_customer_management.sql`, el negocio puede agregar y editar clientes desde la app. El teléfono se guarda solo con dígitos, incluido el código de país, y es único por negocio. Los pedidos web ya crean o reutilizan ese mismo cliente al enviarse; completar el pedido no crea otro registro. Un nombre coincidente con otro teléfono solo genera una advertencia para revisión.

Al aplicar `202611070004_preserve_customers_and_confirm_order_completion.sql`, un pedido web nuevo conserva los datos que el comprador envió como una instantánea del pedido sin sobrescribir el contacto guardado. Al marcarlo completado, el negocio puede conservar el contacto o actualizarlo con esos datos. Los pedidos web completados muestran el comprador original en el historial y mantienen el detalle de productos.

Al aplicar `202611070005_link_customers_to_sales.sql`, cada venta del punto de venta puede asociarse opcionalmente con un cliente existente. El enlace se valida en Neon y las ventas web completadas quedan asociadas al cliente del pedido.

## 5. Primera configuración del negocio

1. Registra una cuenta e inicia sesión.
2. En la sección del negocio, configura nombre, colores, dirección y teléfono.
3. Crea productos con precio y elige si cada producto está activo.
4. Si corresponde, configura un precio promocional y activa o desactiva la promoción con su interruptor. No hay vencimiento automático.
5. Haz una venta de prueba con cantidades enteras.
6. Revisa dashboard, catálogo público y comprobante; prueba imprimir o guardar como PDF.

## 6. Gestionar cambios de base de datos

- Por cada cambio de esquema, crea un archivo SQL nuevo y versionado dentro de `database/migrations/`; no reescribas una migración ya aplicada en otros entornos.
- Prueba la nueva migración en una branch de desarrollo antes de producción.
- Mantén una lista o registro de las migraciones aplicadas en cada entorno. Los archivos del repositorio por sí solos no registran automáticamente qué se ejecutó.
- Antes de ejecutar una migración, verifica cuidadosamente el proyecto y branch de la cadena `DATABASE_URL`.
- Conserva respaldos y un procedimiento probado de restauración antes de cambios importantes.

### Error de función ausente en la caché de Neon Data API

Si la app muestra `Could not find the function public.create_sale(p_customer_id, p_items) in the schema cache` después de aplicar `202611070005_link_customers_to_sales.sql`, comprueba primero que la función exista en la misma branch/base de datos configurada para la app:

```sql
select pg_get_function_arguments(p.oid)
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'create_sale';
```

La firma esperada es `p_items jsonb, p_customer_id uuid DEFAULT NULL::uuid`. También se puede comprobar el permiso con `select has_function_privilege('authenticated', 'public.create_sale(jsonb,uuid)', 'execute');`; PostgreSQL puede mostrar `t` para `true`.

Si la función y el permiso existen, pero sigue el error, actualizar o volver a guardar la configuración de **Data API** en Neon para esa misma branch y base de datos refresca la caché del esquema. En una instalación de este proyecto, `NOTIFY pgrst, 'reload schema';` y un redeploy de Vercel no bastaron; actualizar la configuración de Data API sí lo resolvió. No hace falta cambiar variables de Vercel. Neon documenta que actualizar la configuración de Data API refresca la caché: https://api-docs.neon.tech/reference/updateprojectbranchdataapi.

## Lista de comprobación antes de compartir la instalación

- El emprendedor tiene acceso a su proyecto Neon, Vercel y repositorio.
- Neon Auth y Neon Data API están habilitados para la branch usada.
- La migración se probó y se aplicó a la base correcta.
- Las dos URL configuradas en Vercel corresponden a la misma branch.
- Existe un Vercel Blob store público conectado al proyecto y su `BLOB_READ_WRITE_TOKEN` está disponible para Production/Preview.
- La migración de imágenes se aplicó a la misma branch de Neon usada por la app.
- Neon Auth permite el dominio de producción.
- `202611080001_installation_access_control.sql` está aplicada y el propietario inicial quedó configurado como administrador.
- `202611080002_sales_maintenance.sql` está aplicada para habilitar edición de cliente y anulación de ventas.
- `202611080003_confirmed_record_deletion.sql` está aplicada para habilitar eliminaciones confirmadas y proteger referencias históricas.
- `202611090001_reject_installation_access.sql` está aplicada para distinguir rechazos de revocaciones y permitir reconsiderar solicitudes.
- El modo de acceso elegido (Personal o SaaS educativo) coincide con quién administrará las altas.
- RLS permanece habilitado y las políticas y funciones de la migración están presentes.
- No hay contraseñas SQL, claves administrativas ni tokens secretos en Git o variables `VITE_*`.
- Se probó el flujo de registro, marca, productos, promoción, venta, dashboard, catálogo y comprobante.
- Existe un plan de respaldo y se sabe quién administra las credenciales y futuras migraciones.
