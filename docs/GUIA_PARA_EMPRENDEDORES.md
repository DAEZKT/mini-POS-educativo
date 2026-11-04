# Dos formas de instalar tu Mini POS

Esta guía te ayuda a elegir cómo instalar tu propia copia de Mini POS. En los dos caminos tendrás tus propios proyectos de Neon y Vercel, y podrás probar la app con tus datos.

> **Importante:** GitHub guarda el código, Neon guarda la base de datos y Vercel publica la aplicación en internet. Son tres servicios distintos y necesitarás crear una cuenta en cada uno.

## ¿Qué camino te conviene?

| Camino | Recomendado si… | ¿Necesitas instalar herramientas? |
| --- | --- | --- |
| 1. Desde GitHub y Vercel | Quieres instalar la app con pocos pasos y no planeas cambiar el código. | No necesitas VS Code para el despliegue inicial. |
| 2. Desde tu computadora y VS Code | Quieres guardar una copia propia, aprender a cambiar la app o mantener tu repositorio. | Sí: VS Code, Git y Node.js. |

En ambos casos, Neon necesita que configures la base de datos con las migraciones SQL que vienen en el repositorio. La diferencia principal es dónde guardas y administras el código.

### Fork y clone no son lo mismo

- **Fork (bifurcar):** GitHub crea una copia del repositorio en tu cuenta. No descarga nada a tu computadora y no cambia el repositorio original.
- **Clone (clonar):** Git descarga un repositorio a una carpeta de tu computadora para trabajar con sus archivos. Puedes clonar el repositorio original o tu fork.

Para publicar sin editar archivos, basta con hacer un **fork** e importar ese fork desde Vercel; no necesitas clonar. Para trabajar localmente con Git, primero haz un fork y después clona tu fork. Si prefieres empezar descargando un ZIP, puedes publicarlo como un repositorio nuevo con GitHub Desktop.

---

## Camino 1: desplegar desde GitHub

Este camino crea una copia del repositorio en tu cuenta de GitHub mediante **Fork** (bifurcar). Luego conectas esa copia con Vercel. Vercel descarga el proyecto y lo publica por ti; no necesitas abrir ni editar el código.

### Pasos

1. **Crea tus cuentas** en GitHub, Neon y Vercel.
2. **Crea tu copia en GitHub.** En la página del repositorio original, selecciona **Fork** y elige tu cuenta como destino. Así tendrás tu propio repositorio, sin modificar el original.
3. **Crea un proyecto en Neon.** Habilita Neon Auth y Neon Data API para la branch que usarás. Guarda a mano las URL que Neon te indique.
4. **Prepara la base de datos.** Abre la carpeta `database/migrations` de tu repositorio en GitHub y copia el contenido de cada archivo SQL, uno por uno, al SQL Editor de Neon. Ejecuta primero la migración inicial y confirma que terminó correctamente. Si el repositorio incorpora más migraciones después, aplícalas en orden y solo una vez cada una.
5. **Conecta GitHub con Vercel.** En Vercel, importa tu repositorio (el que está bajo tu cuenta) y crea el proyecto.
6. **Configura las variables de entorno en Vercel.** Añade `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` con las URL de la misma branch de Neon.
7. **Publica la app.** Inicia el despliegue desde Vercel y espera a que termine.
8. **Autoriza el dominio.** En Neon Auth, permite el dominio que te asignó Vercel. Si Vercel publica un dominio distinto para producción, autoriza ese dominio también.
9. **Prueba la instalación.** Abre el sitio, crea una cuenta y configura el negocio. Añade un producto de prueba, prueba su promoción, registra una venta y revisa el dashboard, el catálogo público y el comprobante.

### ¿Qué pasa con el repositorio original y las actualizaciones?

El fork que creaste es tu propia copia. Las personas que descargan o hacen un fork de tu repositorio no pueden modificarlo. Solo tú y quienes tengan permiso de escritura pueden hacer cambios directamente. Si alguien te envía una propuesta de cambios (*pull request*), tú decides si la aceptas o la rechazas.

Los cambios futuros del repositorio original del proyecto no se incorporan automáticamente a tu fork. Puedes seguir usando tu versión o aprender a traer actualizaciones más adelante.

Vercel publica el código que está guardado en tu fork. Si quieres trabajar con los archivos en tu computadora, sigue el camino 2.

---

## Camino 2: descargar el proyecto y subir tu propia copia

Este camino deja el código en tu computadora y crea un repositorio bajo tu cuenta de GitHub. Es útil si quieres cambiar textos, estilos o funciones, o aprender a mantener tu versión.

### Antes de empezar

Instala en tu computadora:

- [Git](https://git-scm.com/downloads), para guardar versiones y subir el proyecto a GitHub.
- [Visual Studio Code](https://code.visualstudio.com/), para abrir y editar los archivos.
- [Node.js](https://nodejs.org/), que incluye npm y permite preparar la app localmente.

### Pasos

1. **Descarga el repositorio** desde GitHub como archivo ZIP y descomprímelo. Para esta ruta, es la forma más sencilla de obtener los archivos sin configurar Git desde el primer paso.
2. **Abre la carpeta del proyecto** en Visual Studio Code.
3. **Instala las dependencias.** Abre una terminal en VS Code, dentro de la carpeta del proyecto, y ejecuta:

   ```bash
   npm install
   ```

4. **Crea tu proyecto Neon** y habilita Neon Auth y Neon Data API para la branch que usarás.
5. **Aplica las migraciones.** Abre `database/migrations` en VS Code. Copia cada archivo SQL al SQL Editor de Neon y ejecútalo en orden, una sola vez por archivo. Anota cuáles aplicaste.
6. **Prepara la configuración local.** Copia `.env.example` como `.env.local` y completa `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` con las URL de tu branch de Neon. No compartas ni subas `.env.local` a GitHub.
7. **Permite el acceso local** en Neon Auth para `http://localhost:5173`.
8. **Prueba en tu computadora** ejecutando `npm run dev` en la terminal de VS Code. Vite mostrará una dirección local para abrir en el navegador.
9. **Crea un repositorio nuevo en tu cuenta de GitHub.** Usa un nombre distinto si quieres diferenciar tu versión, por ejemplo `mi-mini-pos`.
10. **Sube el proyecto a tu repositorio.** Instala GitHub Desktop, inicia sesión con tu cuenta y agrega/publica la carpeta como un repositorio nuevo. Asegúrate de crear el repositorio bajo tu cuenta. También puedes usar Git desde la terminal siguiendo la ayuda oficial de GitHub.
11. **Conecta tu nuevo repositorio con Vercel.** En Vercel, importa el repositorio que acabas de crear.
12. **Configura en Vercel** `VITE_NEON_AUTH_URL` y `VITE_NEON_DATA_API_URL` con las mismas URL de Neon. No copies la contraseña de conexión PostgreSQL en esas variables.
13. **Despliega y autoriza el dominio** de Vercel en Neon Auth.
14. **Repite las pruebas principales** desde el dominio publicado: cuenta, marca, productos, promoción, venta, dashboard, catálogo y comprobante.

### Atención con las migraciones

Las migraciones cambian la estructura de la base de datos; no se ejecutan automáticamente al subir el código. Cuando haya una migración nueva:

1. Descarga o actualiza los archivos del proyecto.
2. Lee la nueva migración y comprueba el proyecto y branch de Neon que vas a modificar.
3. Pruébala primero en una branch de desarrollo o una base de pruebas.
4. Aplícala en producción una sola vez y anota que quedó ejecutada.
5. Despliega la versión de la app que necesita ese cambio.

No vuelvas a ejecutar una migración ya aplicada, a menos que el propio archivo indique explícitamente que es seguro hacerlo.

---

## Reglas importantes para los dos caminos

- **No compartas tu contraseña de Neon.** `DATABASE_URL` permite acceso administrativo a la base de datos. Para el Camino 1, copia los archivos SQL en el SQL Editor de Neon. Para el Camino 2, usa el SQL Editor o sigue la [guía técnica de despliegue](DEPLOYMENT.md) si vas a trabajar desde una terminal.
- **No subas `.env.local` a GitHub** ni publiques contraseñas o claves administrativas. Las variables que empiezan por `VITE_` se usan en la app web; no pongas secretos en ellas.
- **Empieza con datos de prueba.** Antes de usar la app con clientes, confirma el funcionamiento y prepara respaldos.
- **Guarda el acceso a tus cuentas.** Tú administras GitHub, Neon, Vercel, el dominio y los datos de tu negocio.

Si encuentras un paso que no coincide con las opciones actuales de Neon, GitHub o Vercel, consulta también la [guía técnica detallada](DEPLOYMENT.md), que explica las variables, la conexión SQL y la comprobación antes de producción.

### Si ya trabajas con Git

También puedes hacer un fork del repositorio, clonar **tu fork** a la computadora y abrir esa carpeta en VS Code. Cuando subas cambios, haz `push` a tu fork. No intentes subir cambios al repositorio original: no tendrás permiso y no es necesario para publicar tu propia instalación.
