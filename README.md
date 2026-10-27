# Taller3D — Calculadora e inventario de impresión 3D (Chile)

Aplicación web estática (sin backend, sin build, sin dependencias) para
estimar el costo real y el precio de venta de piezas impresas en 3D, y
llevar un inventario de impresoras, filamento/resina y herramientas.
Pensada para makers y pequeños vendedores en Chile: todo en pesos
chilenos (CLP), con tarifa eléctrica, depreciación de impresora y mano
de obra como factores explícitos.

## Uso

Abre `index.html` en el navegador, o publícala como sitio estático
(GitHub Pages, Netlify, Vercel, etc.). No requiere servidor ni build.

## Secciones

- **Calculadora**: material (filamento o resina), tiempo de impresión,
  electricidad, depreciación de la impresora, mantención, mano de obra,
  tasa de fallas, costos extra, margen y comisión de plataforma de
  venta. Muestra el desglose completo, el precio sugerido, la ganancia
  neta, el precio por gramo/ml y la **ganancia por hora de impresora**
  (para comparar qué proyectos realmente conviene imprimir).
- **Impresoras**: FDM o resina, con foto, marca/modelo, potencia, valor
  de compra y vida útil estimada — estos tres últimos alimentan
  directamente la calculadora.
- **Filamento y resina**: stock por color y marca, con precio por kg o
  por litro según el tipo.
- **Herramientas y accesorios**: lo que usas junto a la impresora
  (espátulas, boquillas de repuesto, guantes, etc.).
- **Cotizaciones**: guarda cualquier cálculo con un nombre, para llevar
  un historial de precios ya cotizados. Desde ahí puedes volver a
  cargarlo en la calculadora o generar una **cotización imprimible**
  (hoja limpia en PDF/papel, pensada para mostrarle al cliente) con el
  botón "Imprimir" o "Cotización para cliente".

## Cómo guarda tus datos

Esta versión **no tiene servidor ni base de datos en la nube**: todo
(impresoras, materiales, herramientas, cotizaciones) se guarda en el
`localStorage` del navegador que estés usando. Esto significa:

- Tus datos **no se sincronizan** entre computadores ni navegadores.
- Si limpias los datos del sitio en el navegador, los pierdes.
- Usa el botón ⚙ (arriba a la derecha) → **Exportar datos** para
  descargar un respaldo en JSON, y **Importar datos** para cargarlo de
  vuelta (en el mismo navegador o en otro computador).

Las fotos de impresoras se comprimen y se guardan como imagen embebida
junto con el resto de los datos — no se suben a ningún servidor.

## Tema claro/oscuro

Sigue el tema del sistema por defecto; el botón 🌙/☀ en la parte
superior permite forzar un tema específico, que se recuerda en este
navegador.

## Fórmulas

- **Material**: `peso_g × (1 + merma%) / 1000 × precio_CLP_por_kg`
  (la misma fórmula sirve para resina usando ml y CLP/L).
- **Electricidad**: `potencia_W / 1000 × horas × tarifa_CLP_kWh`.
- **Depreciación**: `valor_impresora / vida_útil_horas × horas_impresión`.
- **Mantención**: `gasto_mensual / horas_uso_mensual × horas_impresión`.
- **Ajuste por fallas**: el costo directo se divide por
  `(1 − tasa_fallas%)`, repartiendo el costo de las piezas que fallan
  entre las que sí se venden.
- **Precio de venta**: costo total × `(1 + margen%)`, y si hay comisión
  de plataforma, se divide por `(1 − comisión%)` para que el margen se
  mantenga después de la comisión (no se suma aparte).

## Nota

Es una herramienta de referencia. Verifica siempre tu tarifa eléctrica
real (varía por distribuidora, comuna y bloque de consumo) y ajusta los
porcentajes a tu caso. No constituye asesoría tributaria ni contable.
