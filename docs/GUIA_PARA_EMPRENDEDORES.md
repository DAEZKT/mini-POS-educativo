# Poner en marcha tu Mini POS: guía sin terminal

Esta ruta te lleva desde el repositorio de GitHub hasta tu propia aplicación publicada. No hace falta escribir comandos. Sí tendrás que copiar archivos SQL en Neon y completar formularios de configuración en los sitios web.

## Qué necesitas

- Una cuenta en [GitHub](https://github.com/), [Neon](https://neon.tech/) y [Vercel](https://vercel.com/).
- Acceso al repositorio de Mini POS.
- Un correo que puedas confirmar para crear la cuenta propietaria.

GitHub guarda el código, Neon guarda las cuentas y los datos, y Vercel publica la aplicación. Crea los tres proyectos/cuentas con un correo que controles.

## 1. Haz tu copia en GitHub y abre VS Code

1. Inicia sesión en GitHub y abre el repositorio de Mini POS.
2. Pulsa **Fork** y crea una copia en tu cuenta. Esa copia será tuya; el repositorio original no se modifica.
3. Abre tu fork. Pulsa la tecla **`.` (punto)**. Se abrirá el editor web de VS Code (github.dev) con los archivos de tu copia. Si el punto no funciona, escribe `dev` en vez del com en el enlace de tu copia.
4. En el explorador de archivos del editor, confirma que ves carpetas como `database`, `src` y `api`. Para esta puesta en marcha solo usaremos `database/migrations` para copiar SQL; no necesitas cambiar código.

El editor web permite ver y copiar archivos. No necesitas instalar VS Code en la computadora para publicar desde GitHub y Vercel.

## 2. Crea Neon y prepara la base de datos

1. En Neon, crea un proyecto nuevo. Elige una región cercana a tus clientes y conserva la branch principal que se crea con el proyecto.
2. En el proyecto/branch, habilita **Neon Auth** y **Neon Data API** si aún no están habilitados. Configura el inicio de sesión por correo según las opciones que te presente Neon.
3. Anota las URL completas de **Auth** y **Data API** de esa misma branch. Vercel las pedirá más adelante. No uses URL de branches diferentes.
4. Abre el **SQL Editor** de Neon y confirma que está conectado al proyecto, branch y base que acabas de crear.
5. En el VS Code web, abre `database/migrations`. Abre los archivos de la lista siguiente en orden. En cada uno, selecciona y copia todo su contenido; vuelve al SQL Editor de Neon, pégalo y pulsa **Run/Ejecutar**. Espera a que termine sin error antes de pasar al siguiente.

Ejecuta cada archivo **una sola vez**, en este orden:

1. `202611010001_initial_schema.sql`
2. `202611040001_product_images.sql`
3. `202611040002_product_categories.sql`
4. `202611050001_business_currency.sql`
5. `202611050002_product_description_length.sql`
6. `202611050003_business_currency_symbol.sql`
7. `202611050004_public_catalog_orders.sql`
8. `202611060001_public_order_details.sql`
9. `202611070001_accept_google_maps_query_urls.sql`
10. `202611070002_public_orders_to_sales.sql`
11. `202611070003_manual_customer_management.sql`
12. `202611070004_preserve_customers_and_confirm_order_completion.sql`
13. `202611070005_link_customers_to_sales.sql`
14. `202611080001_installation_access_tables.sql`
15. `202611080002_installation_access_functions.sql`
16. `202611080003_installation_access_policies.sql`
17. `202611080004_secure_sales_order_functions.sql`
18. `202611080005_sales_maintenance.sql`
19. `202611080006_confirmed_record_deletion.sql`
20. `202611090001_reject_installation_access.sql`

Antes de continuar, confirma en Neon que aparecen las tablas `installation_settings` e `installation_access`, y en la lista de funciones `get_installation_config` y `get_my_installation_access`. Si alguna falta, detente y no inicialices la cuenta propietaria todavía.

Si una ejecución muestra un error, detente y conserva el mensaje. No sigas con las siguientes ni vuelvas a ejecutar a ciegas un archivo que pudo haberse aplicado parcialmente. Estas migraciones preparan tablas, permisos y funciones que la aplicación necesita.

## 3. Publica desde GitHub en Vercel

1. En Vercel, elige **Add New… → Project** y conecta GitHub si te lo pide.
2. Importa el fork de Mini POS que acabas de crear. Conserva los valores detectados por Vercel: el proyecto usa Vite y su configuración de publicación está incluida en el repositorio.
3. Antes de pulsar **Deploy**, abre **Environment Variables** y crea estas tres variables con los valores de Neon, exactamente como los muestra Neon:

   - `VITE_NEON_AUTH_URL` — URL de Neon Auth.
   - `VITE_NEON_DATA_API_URL` — URL de Neon Data API.
   - `VITE_TURNSTILE_SITE_KEY` — sitekey pública de Cloudflare Turnstile, si habilitarás pedidos desde el catálogo.

   Las dos URL de Neon deben ser de la misma branch. Si todavía no configuraste Turnstile, puedes publicar primero sin esa variable, pero la protección del formulario de pedidos no quedará configurada.

4. Pulsa **Deploy** y espera a que Vercel indique que el despliegue terminó correctamente. Abre el dominio `*.vercel.app` que te muestra.
5. Copia ese dominio y agrégalo en Neon Auth a los dominios/orígenes permitidos. Añade el host que te asignó Vercel (por ejemplo `mi-mini-pos.vercel.app`); autoriza también `http://localhost:5173` solo si después harás pruebas locales. Si cambias variables, vuelve a desplegar desde Vercel para que la versión publicada las reciba.

### Configuraciones adicionales para imágenes y pedidos

La aplicación básica puede abrirse sin estos pasos, pero estas funciones necesitan configuración de servidor:

- **Fotos de productos:** en Vercel, crea un almacén **Blob** con acceso **Public** y conéctalo al proyecto. Vercel agrega `BLOB_READ_WRITE_TOKEN` como secreto. No lo crees como variable `VITE_`.
- **Pedidos desde el catálogo:** crea un widget en Cloudflare Turnstile para el dominio de Vercel. En Vercel añade `VITE_TURNSTILE_SITE_KEY` (pública) y `TURNSTILE_SECRET_KEY` (privada). Añade también `DATABASE_URL` como variable secreta de servidor, copiando la conexión PostgreSQL de la misma branch de Neon. Nunca uses prefijo `VITE_` para secretos ni compartas esta URL. Vuelve a desplegar después de agregar las variables.

## 4. Registra y autoriza a la persona propietaria

Haz este paso antes de compartir el enlace público. El modo inicial es **Personal** y solo la cuenta que se autorice como administradora podrá entrar.

1. Abre el sitio publicado en Vercel y elige **Crear cuenta**. Registra el correo de la persona propietaria y confirma el correo si Neon lo solicita.
2. En Neon, vuelve al SQL Editor de la branch correcta. Ejecuta esta consulta para encontrar la cuenta recién creada:

   ```sql
   select id, email from neon_auth."user" order by "createdAt";
   ```

3. Identifica con cuidado la fila de la persona propietaria. Copia su `id` (UUID) y correo.
4. En el bloque siguiente sustituye `UUID_CONFIRMADO` por ese ID y `propietario@ejemplo.com` por el correo exacto de la cuenta. Ejecuta el bloque en SQL Editor:

   ```sql
   insert into public.installation_access (user_id, email, status, role, reviewed_at)
   values ('UUID_CONFIRMADO', 'propietario@ejemplo.com', 'approved', 'admin', now())
   on conflict (user_id) do update
   set email = excluded.email, status = 'approved', role = 'admin', reviewed_at = now();

   update public.installation_settings
   set access_mode = 'personal', initialized = true, updated_at = now()
   where singleton;
   ```

5. Cierra sesión en la aplicación y vuelve a entrar con la cuenta autorizada. Ya puedes crear el negocio. En modo Personal, el formulario de registro deja de mostrarse después de inicializar la instalación.

## 5. Configura y prueba el negocio

Antes de invitar clientes, prueba el sistema con información ficticia:

1. Entra a **Mi negocio** y configura nombre, colores, dirección y teléfono.
2. Crea una categoría y un producto de prueba. Prueba precio y promoción; si configuraste Blob, prueba también una imagen.
3. Registra una venta y revisa que aparezca en el dashboard e historial. Prueba imprimir el comprobante.
4. Abre el catálogo público y revisa que muestre los productos activos. Si activaste pedidos, prueba el formulario y el enlace a WhatsApp.
5. Descarga el catálogo PDF y confirma que se vea bien desde un teléfono.

Cuando todo funcione, comparte el dominio de Vercel. Guarda en un lugar seguro el acceso a GitHub, Neon y Vercel. El código no hace copias de seguridad de la base de datos por ti: configura y revisa los respaldos de Neon.

## Si algo cambia o falla

- Si Neon muestra un error al ejecutar una migración, no la repitas automáticamente. Confirma que estás en la branch correcta y guarda el texto del error.
- Si el sitio no conecta, revisa que las dos URL de Neon estén en Vercel y correspondan a la misma branch; luego haz un nuevo despliegue.
- Si el registro o acceso falla, comprueba que el dominio de Vercel esté autorizado en Neon Auth y que la cuenta propietaria se haya aprobado con el procedimiento anterior.
- Las futuras migraciones también se aplican manualmente en Neon, una vez y en el orden indicado por la guía de despliegue. No reemplaces una migración que ya ejecutaste.

Para detalles técnicos o migraciones de instalaciones existentes, consulta [Despliegue en Neon y Vercel](DEPLOYMENT.md). Esta guía describe una instalación nueva.
