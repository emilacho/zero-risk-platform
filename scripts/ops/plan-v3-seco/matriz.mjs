// SECO DEL PLAN v3 (V11) · LA MATRIZ · CC#1 · 15-oct · datos puros (sin red, sin disco). Cuatro negocios de práctica × los casos de la tanda; un solo código, solo cambian datos y filas.
// 🔴 Un caso `requiere` piezas que aún no existen (V8 pre-vuelo con `solo_portero` y el contrato `cerebro_listo`, V9 nodos): queda LISTADO y se marca `pendiente`, no se simula como si existiera.

/** negocios de práctica (ficticios y genéricos). `capacidades` decide qué fuentes aplican (F7 «no aplica» no es falla) */
export const NEGOCIOS = [
  { id: 'N', nombre: 'Casa de Comidas La Ribera', rubro: 'restaurante con entrega', pais: 'Ecuador', ciudad: 'Manta', registro: 'tuteo', capacidades: { mapas: true, instagram: true, analitica: true, anuncios: true } },
  { id: 'T', nombre: 'Tienda Hilos y Más', rubro: 'tienda en línea', pais: 'Ecuador', ciudad: 'Cuenca', registro: 'tuteo', capacidades: { mapas: false, instagram: true, analitica: true, anuncios: true } },
  { id: 'S', nombre: 'Asesoría Legal Cedeño', rubro: 'servicio B2B de ciclo largo', pais: 'Ecuador', ciudad: 'Quito', registro: 'tuteo', capacidades: { mapas: true, instagram: false, analitica: false, anuncios: false } },
  { id: 'P', nombre: 'Consultorio Dra. Vera', rubro: 'profesional con citas', pais: 'Ecuador', ciudad: 'Loja', registro: 'tuteo', capacidades: { mapas: true, instagram: true, analitica: false, anuncios: false } },
]

/** `requiere`: piezas que faltan para correrlo de verdad; vacío = corre hoy en el seco local (puro, US$ 0) */
export const CASOS = [
  { id: 'B1', que: 'base · el cerebro está listo a tiempo, lo que falta se rellena y el plan cita su tabla', requiere: [] },
  { id: 'L1', que: '«cerebro listo» a tiempo (minuto 0): corre sin esperar', requiere: [] },
  { id: 'L2', que: '`completando` hasta el minuto 44: sigue esperando sin salir a Apify y, listo en la última lectura (45:00), corre', requiere: [] },
  { id: 'L3', que: 'sin listo a los 45:00: vence, corre con lo del alta, lo declara y NO rellena con Apify', requiere: [] },
  { id: 'L4', que: 'listo con `huecos[]`: solo eso puede ir a relleno y el plan declara lo que falta', requiere: [] },
  { id: 'C6', que: 'el `portero` corrió hoy y el plan corre hoy: el gasto del portero no apaga al portero ni deja al juez sin presupuesto', requiere: ['V8', 'solo_portero'] },
  { id: 'C7', que: 'el plan corre ANTES del `portero` ese día: el vigilante no lo apaga y su juez conserva su tope', requiere: ['V8', 'solo_portero'] },
  { id: 'C17', que: 'una ficha de homónimo en el crudo NO llega al pedido (se cuenta y se declara)', requiere: [] },
  { id: 'V2', que: 'anuncios: registro sin campos ⇒ hueco; el plan no dice «no tiene»', requiere: [] },
  { id: 'E1', que: '`dry_run:true` ⇒ de ensayo en TODO, encabezado «BORRADOR», no entra a la semilla como medido', requiere: [] },
  { id: 'E5', que: '`dry_run` ausente = real (la sala no lo manda): no sella ensayo', requiere: [] },
  { id: 'R1', que: 'refresco con cambio material ⇒ nueva ronda; sin cambio ⇒ bloque conservado «sobre datos del …»', requiere: [] },
  { id: 'R2', que: 'refresco con cambio material y las 2 rondas ya usadas ⇒ se conserva y lo dice', requiere: [] },
  { id: 'G2', que: 'pedido enorme: mide y recorta por prioridad, declara `datos_omitidos` y no parte la tabla', requiere: [] },
  { id: 'S40', que: 'semilla de la oficina: ≤ 40.000 caracteres, valida, con `datos_omitidos` declarados', requiere: [] },
  { id: 'M2', que: 'P10 sobre un plan que cita: sin marcas altas; sobre un plan «v2» sin citas: marca lo real (< 15 altas)', requiere: [] },
  { id: 'O1', que: 'ORO: la ficha del piloto tal cual (169→173 fichas, país «Ecuador», sin moneda declarada): bloque con moneda `supuesto` rotulada, no «sin bloque»', requiere: [] },
  { id: 'PL', que: 'plazos: peor caso de la recolección + espera ≤ techo del §10.3 (110 min con espera; 80 sin ella)', requiere: [] },
  { id: 'X1', que: 'punta a punta REAL: webhook → pre-vuelo → espera por re-disparo → recolección → oficina → redactor → P10 → guardar', requiere: ['V8', 'V9', 'migraciones V1/V13 aplicadas', 'solo_portero', 'cerebro_listo'] },
]

/** qué negocios corren qué caso (todos corren todo salvo lo que no aplica a su capacidad) */
const NO_APLICA = {
  C17: (n) => !n.capacidades.mapas,           // sin ficha de Mapas no hay homónimo de Mapas que probar
  V2: (n) => !n.capacidades.anuncios,         // sin biblioteca de anuncios: no aplica (F7), no es falla
  O1: (n) => n.id !== 'N',                    // el oro es UNO: va con el negocio N (la forma del piloto)
  X1: (n) => n.id !== 'N',
}

export function celdas() {
  const out = []
  for (const n of NEGOCIOS) for (const c of CASOS) {
    if (NO_APLICA[c.id]?.(n)) continue
    out.push({ id: `${n.id}-${c.id}`, negocio: n, caso: c, pendiente: c.requiere.length > 0, requiere: c.requiere })
  }
  return out
}

export function resumenDeLaMatriz() {
  const cs = celdas()
  return { negocios: NEGOCIOS.length, casos: CASOS.length, celdas: cs.length, corren_hoy: cs.filter((c) => !c.pendiente).length, pendientes: cs.filter((c) => c.pendiente).length }
}

/** las condiciones antes del primer encendido real (lo que falta lo dice `condiciones` leyendo; aquí solo la lista) */
export const CONDICIONES = [
  { id: 'P1', texto: 'V1 aplicada (5 tablas `plan_catalogo_*` + semilla) con respaldo y 0 corridas', sonda: 'tablas' },
  { id: 'P2', texto: 'V13 aplicada (`plan_corridas`) con la espera de 45 min', sonda: 'tablas' },
  { id: 'P3', texto: '`GET /api/planeacion/catalogo` responde 200 con huella', sonda: 'ruta' },
  { id: 'P4', texto: '`GET /api/brain/alimentar/listo` trae `completando` y `huecos[]`', sonda: 'ruta' },
  { id: 'P5', texto: '`solo_portero` en `gastoDeHoy` fusionado (CC-CEREBRO) — no se puede comprobar por lectura externa', sonda: 'certificacion' },
  { id: 'P6', texto: 'V8 (pre-vuelo con cupo, `dry_run` ausente = real, espera reanudable) construido y certificado', sonda: 'certificacion' },
  { id: 'P7', texto: 'V9 (nodos n8n con respaldo y «vivo = respaldo») construido y certificado', sonda: 'certificacion' },
  { id: 'P8', texto: 'el `portero` del cliente de práctica pausado ese día (interruptor por cliente)', sonda: 'certificacion' },
  { id: 'P9', texto: 'ficha de cada cliente de práctica con `spend_cap_usd` ≥ 4,00 + lo gastado + margen (con restauración)', sonda: 'lectura' },
]

/** contadores que se miran ANTES y DESPUÉS: el seco no debe mover ninguno salvo los que la corrida declara */
export const CONTADORES = [
  { tabla: 'agent_invocations', por: 'client_id', nota: 'el seco con agentes simulados no escribe filas' },
  { tabla: 'costs', por: 'client_id', nota: 'ningún proveedor se llama' },
  { tabla: 'plan_corridas', por: 'client_id', nota: 'solo las corridas de práctica, y la limpieza las deja en 0' },
  { tabla: 'cerebro_fichas', por: 'client_id', nota: 'el plan NO escribe fichas (eso es del portero)' },
  { tabla: 'hitl_queue', por: 'client_id', nota: 'las marcas altas escriben aviso: en seco no' },
  { tabla: 'client_historical_outputs', por: 'client_id', nota: 'el seco no guarda un plan real' },
]

/** el tramo de la oficina financiera dentro del plan (15-oct): corre en seco con la ruta real y agentes simulados (`__tests__/plan-v3-seco-oficina-x1.test.ts`) · negocios N T S P  + el caso de oro (la ficha del piloto tal cual) */
export const OFICINA_CASOS = [
  { id: 'OF-firmado', que: 'proponente → hilo → acuerdo del jefe → bloque → firma: el bloque firmado entra al plan; P8/P9 sin marcas; una cifra inventada SÍ se marca' },
  { id: 'OF-sin_acuerdo', que: 'sin referencia de costo: sin bloque; el plan sale con sus supuestos rotulados y el pedido idéntico a hoy' },
  { id: 'OF-sin_firma', que: 'el jefe no contesta: sin firma; el bloque NO entra; el plan sale' },
  { id: 'OF-vencido', que: 'cierre por tope (US$ 1,50 + una llamada): sin firma; el plan sale' },
  { id: 'OF-apagada', que: 'oficina apagada: 409 sin escribir; el plan sale idéntico a hoy' },
]

/** el guion VIVO de X1 / C6 / C7 (solo cuando CC#3 avise que la tanda 1 y la tanda 2 están en vivo) */
export const GUION_VIVO = [
  '0. `plan-v3-seco.mjs condiciones --cliente <id>` (P1–P4 y P9) y `estado` (n8n 0/0, flujo de planeación)',
  '1. `plan-v3-seco.mjs contadores --clientes <ids> --guardar antes.json`',
  '2. el seco en este orden, uno por negocio de práctica y luego el caso de oro (la ficha del piloto tal cual), SIEMPRE con `dry_run:true` explícito:',
  '   · C6: el `portero` ya corrió hoy → el plan corre y el gasto del portero no lo apaga',
  '   · C7: el plan corre ANTES del `portero` → el vigilante no lo apaga y su juez conserva el tope',
  '   · X1: webhook → pre-vuelo → espera por re-disparo (≤ 45 min) → recolección → oficina financiera → redactor → P10 → guardar',
  '   · oficina: firmado · sin acuerdo · sin firma · vencido (`OFICINA_CASOS`)',
  '3. `plan-v3-seco.mjs contadores --clientes <ids> --comparar antes.json` → 0 diferencias fuera de las tablas de ensayo',
]
