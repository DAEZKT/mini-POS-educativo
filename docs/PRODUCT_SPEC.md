# Alcance funcional de Mini POS

## Objetivo

Dar a una persona emprendedora una herramienta sencilla para configurar la marca de su negocio, registrar productos y ventas, y compartir un catálogo público. Cada instalación pertenece al propio emprendedor.

## Configuración técnica principal

React y Vite para la app; Neon Auth para las cuentas; Neon Data API para las consultas; PostgreSQL y RLS para los datos; Vercel para el despliegue. Cada emprendedor utiliza su propio proyecto/branch Neon y su propio proyecto Vercel.

## Funciones incluidas

1. **Cuenta:** registro e inicio de sesión mediante correo y contraseña con Neon Auth.
2. **Marca:** nombre, colores principal y secundario, dirección opcional y teléfono opcional.
3. **Productos:** crear, consultar, editar y eliminar productos. La eliminación exige copiar el nombre y se bloquea si aparece en una venta o pedido web.
4. **Promociones:** precio fijo menor que el precio normal y un interruptor activo/inactivo. No hay fechas ni vencimiento automático.
5. **Venta inmediata:** seleccionar productos activos, asociar un cliente opcional y registrar una venta. Las cantidades son unidades enteras positivas.
6. **Clientes:** crear, consultar y editar clientes. Se pueden eliminar solo si no están asociados a ventas o pedidos web, tras confirmar copiando el nombre exacto.
7. **Historial de ventas:** consultar ventas, corregir el cliente asociado y anular con motivo sin borrar ni reutilizar el consecutivo. Los productos, cantidades y precios de una venta confirmada no se editan.
8. **Dashboard:** total y número de ventas vigentes para los últimos 7 días, 30 días o todo el historial; productos más vendidos por unidades. Las ventas anuladas no se contabilizan.
9. **Catálogo público:** página por negocio, con marca y productos activos. No muestra información de ventas.
10. **Documentos:** comprobante de venta y catálogo imprimible. Se usa la impresión del navegador para guardar en PDF.

## Reglas de negocio

- Cada cuenta administra un negocio en su propia instalación.
- Los productos inactivos no aparecen en el catálogo interno de venta ni en el público, y la base de datos no permite agregarlos a ventas nuevas.
- Con una promoción activa se aplica el precio promocional; apagada, el precio normal.
- El precio promocional debe ser mayor que cero y menor que el precio normal.
- La base de datos calcula el importe de la venta a partir de los productos, precios vigentes y cantidades recibidas; no confía en el total calculado por el navegador.
- El detalle de venta conserva el nombre, cantidad, precio normal, precio cobrado y promoción aplicada al momento de confirmar.
- Una venta anulada se conserva con su motivo y consecutivo, pero se excluye del dashboard y del cálculo de productos más vendidos.
- La cantidad debe ser un entero mayor que cero; no se admiten fracciones.
- La moneda inicial está fija en córdobas nicaragüenses (NIO).
- El catálogo público se entrega por una función SQL que solo devuelve campos públicos y productos activos.

## Fuera de alcance

Inventario, compras, proveedores, cuentas por cobrar, pagos parciales, múltiples sucursales, variantes de productos (por ejemplo, una prenda con tallas/tallas-color como una sola ficha), roles adicionales y conexión a una base central multiemprendedor.

## Criterios de aceptación

- Una cuenta puede registrarse e iniciar sesión.
- Una persona solo puede leer y modificar los datos de su negocio.
- Es posible cambiar marca y ver los cambios en la app, catálogo y comprobante.
- Un producto activo aparece en ambos catálogos; uno inactivo desaparece y no puede venderse.
- Activar o desactivar la promoción cambia el precio en venta, catálogo y comprobante.
- No se puede activar una promoción inválida ni confirmar una venta con cantidad decimal.
- Las ventas históricas conservan sus precios y datos aunque el producto se edite después.
- El dashboard y el historial muestran los registros guardados.
- El comprobante y el catálogo se pueden imprimir o guardar como PDF.
- Una instalación limpia se puede preparar usando las instrucciones y migraciones del repositorio.
