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

### Añadir imágenes de producto a una instalación existente

Después de desplegar la versión que incluye imágenes, aplica una sola vez `database/migrations/202611040001_product_images.sql` en el SQL Editor de Neon, conectado a la misma branch configurada en Vercel. Esta migración agrega `products.image_url` y actualiza la función del catálogo público; no vuelvas a ejecutar la migración inicial.

Para habilitar categorías, aplica después `database/migrations/202611040002_product_categories.sql` una sola vez en esa misma branch. Crea las categorías por negocio, agrega la relación opcional desde productos y actualiza el catálogo público para devolver el nombre de categoría. Si preparas una instalación nueva, aplica las migraciones en orden: inicial, imágenes y categorías.

Para configurar la moneda, aplica después `database/migrations/202611050001_business_currency.sql` una sola vez en la misma branch. Luego el emprendedor puede elegirla desde **Mi negocio**. La selección cambia el formato de los importes; no convierte ni recalcula los valores numéricos ya guardados. Para instalaciones nuevas, aplica también esta migración después de las anteriores.

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

6. Crea una cuenta de prueba y recorre el flujo de la app.

No guardes datos reales en un entorno de prueba. Mantén `.env.local` fuera de Git.

## 4. Publicar en Vercel

1. Sube el repositorio a una cuenta Git que controles.
2. En Vercel, importa el repositorio como un proyecto nuevo.
3. Añade estas variables para Production, y para Preview solo si vas a utilizar esos despliegues:

   - `VITE_NEON_AUTH_URL`
   - `VITE_NEON_DATA_API_URL`

   Ambas deben corresponder a la misma branch de Neon.

4. Despliega la aplicación.
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

## Lista de comprobación antes de compartir la instalación

- El emprendedor tiene acceso a su proyecto Neon, Vercel y repositorio.
- Neon Auth y Neon Data API están habilitados para la branch usada.
- La migración se probó y se aplicó a la base correcta.
- Las dos URL configuradas en Vercel corresponden a la misma branch.
- Existe un Vercel Blob store público conectado al proyecto y su `BLOB_READ_WRITE_TOKEN` está disponible para Production/Preview.
- La migración de imágenes se aplicó a la misma branch de Neon usada por la app.
- Neon Auth permite el dominio de producción.
- RLS permanece habilitado y las políticas y funciones de la migración están presentes.
- No hay contraseñas SQL, claves administrativas ni tokens secretos en Git o variables `VITE_*`.
- Se probó el flujo de registro, marca, productos, promoción, venta, dashboard, catálogo y comprobante.
- Existe un plan de respaldo y se sabe quién administra las credenciales y futuras migraciones.
