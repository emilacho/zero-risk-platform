// CLIENTES DE PRÁCTICA DEL SECO DE LA JEFATURA (J5) · CC#2 · 13-oct · SOLO ARCHIVOS: nada se inserta en la base (la jefatura guarda `client_id` como TEXTO sin llave hacia `clients`; el llamador entrega los documentos ya leídos en `payload.contexto`).
// Tres rubros distintos (como en r81: restaurante · servicios profesionales · retail), cada uno con su manual, su plan, su estrategia, su calendario, su parte de briefs, sus piezas y el material del «cerebro».
// REGISTRO: el diseño v4 §13.3 pide 3 rubros × 2 registros (tuteo y voseo). Cada cliente declara UN registro en su manual (restaurante y servicios: tuteo; tienda: voseo, por decisión de marca) y `manualEn(cliente, 'tuteo'|'voseo')`
// devuelve el mismo manual con la sección de trato cambiada: así cada rubro se prueba en los dos registros sin inventar seis clientes. La instrucción interna de la jefatura sale SIEMPRE en tuteo; solo las piezas siguen el registro del manual.
// Nada de naufrago.ec. Ningún nombre de persona (el chequeo P7 del plan los marca si la ficha no los declara). Ninguna cifra de precios ni de dinero fuera de la carta/catálogo de cada ficha.
// Tamaños apuntados a lo MEDIDO en producción (diseño v4 §7): manual ≈ 15 k caracteres (el revisor recibe hasta 12 k), plan ≈ 25 k, estrategia ≈ 2,6 k, calendario 60 filas, parte de briefs ≈ 4,9 k.

const reg = (r, tu, vos) => (r === 'voseo' ? vos : tu)

export const ID_PREFIJO = 'prueba-jefatura-seco-'

/** los tres clientes: lo mínimo que cambia entre rubros; todo lo demás se arma con funciones */
export const CLIENTES = [
  {
    id: `${ID_PREFIJO}restaurante`, nombre: 'Fogón del Puerto (PRUEBA)', rubro: 'restaurante', ciudad: 'Cartagena', pais: 'Colombia', moneda: 'COP', registro: 'tuteo', slug: 'fogon-del-puerto',
    publico: 'familias y parejas que cenan en el centro histórico y turistas que buscan cocina caribeña de verdad',
    productos: [['Cazuela de mariscos', 48000], ['Arroz de coco con pescado frito', 36000], ['Ceviche de camarón', 32000], ['Sancocho de pescado', 29000], ['Limonada de coco', 12000], ['Postre de cocada', 9000]],
    pilares: ['La cocina del día', 'Del mar a la mesa', 'Historias del barrio', 'Cómo pedir y reservar'], red_principal: 'instagram', canal_pedido: 'WhatsApp',
    diferencial: 'cocina de fogón con pescado del día y recetas de la costa', prohibidas: ['el mejor de Cartagena', 'gourmet', 'garantizado', 'exclusivo'],
  },
  {
    id: `${ID_PREFIJO}servicios`, nombre: 'Altamira Contadores (PRUEBA)', rubro: 'servicios profesionales', ciudad: 'Monterrey', pais: 'México', moneda: 'MXN', registro: 'tuteo', slug: 'altamira-contadores',
    publico: 'dueños de pequeñas empresas y profesionistas independientes que quieren orden fiscal sin dolores de cabeza',
    productos: [['Contabilidad mensual para pymes', 1800], ['Declaración anual de personas físicas', 900], ['Alta y regularización ante el SAT', 1200], ['Asesoría fiscal por hora', 700], ['Nómina y cuotas obrero-patronales', 1500], ['Revisión de contabilidad atrasada', 2500]],
    pilares: ['Fiscal sin miedo', 'Errores comunes que cuestan caro', 'Fechas que no se pasan', 'Casos de la oficina'], red_principal: 'linkedin', canal_pedido: 'una llamada de diagnóstico',
    diferencial: 'explicar la obligación fiscal en palabras de dueño de negocio y avisar antes de cada fecha límite', prohibidas: ['sin riesgo', 'evita impuestos', 'garantizamos', 'el mejor despacho'],
  },
  {
    id: `${ID_PREFIJO}retail`, nombre: 'Mateando (PRUEBA)', rubro: 'retail', ciudad: 'Valencia', pais: 'España', moneda: 'EUR', registro: 'voseo', slug: 'mateando',
    publico: 'argentinos y uruguayos que viven en España y quieren su yerba, sus mates y sus alfajores sin pasar por tres tiendas',
    productos: [['Yerba mate de 1 kg', 11.9], ['Mate de calabaza curado', 16.5], ['Bombilla de acero inoxidable', 7.9], ['Termo de acero de 1 litro', 29], ['Alfajores de maicena (caja de 6)', 8.5], ['Kit de inicio: mate, bombilla y yerba', 31]],
    pilares: ['Ritual del mate', 'Productos que extrañás', 'Cómo cuidar tu mate', 'Pedidos y envíos'], red_principal: 'instagram', canal_pedido: 'la tienda online',
    diferencial: 'productos traídos de Argentina y Uruguay con envío en 48 horas dentro de España', prohibidas: ['el mejor mate', 'auténtico garantizado', 'oferta imperdible', 'único'],
  },
]

// ───────────────────────── manual
const TRATO = (c, r) => reg(r,
  `## Trato y registro\nLa marca habla de **tú** (tuteo) en todas sus piezas: «tú», «tienes», «cuéntanos», «escríbenos». Nunca usa «vos», «tenés», «escribinos». El tono es cercano y claro, sin tecnicismos y sin exagerar.`,
  `## Trato y registro\nLa marca habla de **vos** (voseo rioplatense) en todas sus piezas: «vos», «tenés», «contanos», «escribinos». Nunca usa «tú», «tienes», «cuéntanos». El tono es cercano y directo, como entre vecinos, sin tecnicismos y sin exagerar.`)

export function manualEn(c, r = c.registro) {
  const prod = c.productos.map(([n, p]) => `- ${n}: ${precio(c, p)}`).join('\n')
  const secs = [
    `# Manual de marca · ${c.nombre}\n\nNegocio: ${c.rubro} en ${c.ciudad}, ${c.pais}. Público: ${c.publico}. Diferencial: ${c.diferencial}.`,
    TRATO(c, r),
    `## Voz\n${reg(r, 'Frases cortas, una idea por frase. Hablamos de lo que el cliente consigue, no de lo que la marca presume. Preferimos un ejemplo concreto a un adjetivo.', 'Frases cortas, una idea por frase. Hablamos de lo que conseguís vos, no de lo que la marca presume. Preferimos un ejemplo concreto a un adjetivo.')}`,
    `## Lo que nunca decimos\nPalabras prohibidas: ${c.prohibidas.join(' · ')}. No prometemos resultados que no controlamos. No nombramos a la competencia. No usamos mayúsculas sostenidas para gritar.`,
    `## Catálogo vigente (precios en ${c.moneda}, tomados de la ficha del cliente; no se inventan otros)\n${prod}`,
    `## Datos de contacto\nCanal de pedido: ${c.canal_pedido}. Red principal: ${c.red_principal}. Ciudad: ${c.ciudad}.`,
    `## Estructura de una pieza\n1. Una primera línea que se entienda sola. 2. Una idea. 3. Un llamado a la acción claro hacia ${c.canal_pedido}. 4. Entre 3 y 6 etiquetas. ${reg(r, 'Revisa que todo verbo vaya en tú.', 'Revisá que todo verbo vaya en vos.')}`,
  ]
  // relleno determinista hasta ≈ 15 k caracteres: ejemplos aprobados por producto y formato (como los que trae un manual real)
  let i = 0
  const formatos = ['post de foto', 'carrusel', 'historias', 'texto de anuncio']
  while (secs.join('\n\n').length < 15000) {
    const [n] = c.productos[i % c.productos.length]
    const f = formatos[Math.floor(i / c.productos.length) % formatos.length]
    secs.push(`### Ejemplo aprobado ${i + 1} · ${n} · ${f}\n${ejemplo(c, r, n, f, i)}`)
    i++
  }
  return secs.join('\n\n')
}

const ejemplo = (c, r, n, f, i) => {
  const cta = reg(r, `Escríbenos por ${c.canal_pedido}.`, `Escribinos por ${c.canal_pedido}.`)
  const cuerpo = reg(r, `${n}: pensado para ${c.publico.split(' que ')[0]}. Cuéntanos qué necesitas y te respondemos hoy.`, `${n}: pensado para ${c.publico.split(' que ')[0]}. Contanos qué necesitás y te respondemos hoy.`)
  return `${cuerpo} ${cta} (variante ${i + 1} del formato «${f}»; la longitud y el cierre se ajustan a la red).`
}

const precio = (c, p) => (c.moneda === 'EUR' ? `${p.toFixed(2).replace('.', ',')} €` : c.moneda === 'COP' ? `$${Math.round(p).toLocaleString('es-CO')} COP` : `$${Math.round(p).toLocaleString('es-MX')} MXN`)

// ───────────────────────── plan de 90 días (≈ 25 k caracteres, 8 secciones, sin marcas «a calcular» ni nombres de personas)
export function planDe(c) {
  const semanas = Array.from({ length: 13 }, (_, k) => {
    const p = c.pilares[k % c.pilares.length], [prod] = c.productos[k % c.productos.length]
    return `Semana ${k + 1}: pilar «${p}». Foco de producto: ${prod}. Dos publicaciones en ${c.red_principal} y una pieza de apoyo (historias o correo). Cierre de semana: revisar qué pieza generó más mensajes por ${c.canal_pedido} y repetir su estructura.`
  })
  const bloques = [
    `# Plan de 90 días · ${c.nombre}\n\n## 1 · Resumen ejecutivo\n${c.nombre} es un negocio de ${c.rubro} en ${c.ciudad}, ${c.pais}. Su público: ${c.publico}. El plan ordena 90 días de contenido alrededor de cuatro pilares (${c.pilares.join(', ')}) con un objetivo único: que más personas escriban por ${c.canal_pedido}. No se prometen cifras que no estén en la ficha del cliente.`,
    `## 2 · Diagnóstico\nLo que sabemos de la ficha: el diferencial es «${c.diferencial}». La red principal es ${c.red_principal}. El catálogo vigente tiene ${c.productos.length} líneas con precio declarado. Lo que no sabemos y se declara en la sección 8: horarios exactos de atención por temporada y capacidad real de entrega en fechas pico.\nCompetencia: se observa por categoría, sin nombrar marcas; la comparación detallada vive en el informe competitivo, no aquí.`,
    `## 3 · Objetivos\n1. Aumentar los mensajes de interés por ${c.canal_pedido} semana a semana, medido contra la semana 1.\n2. Que cada pilar tenga al menos una pieza que se pueda reutilizar como respuesta a preguntas frecuentes.\n3. Mantener un registro de ${reg(c.registro, 'tú', 'vos')} coherente en todas las piezas.`,
    `## 4 · Público y mensajes\nPúblico principal: ${c.publico}. Mensaje central: ${c.diferencial}. Mensajes de apoyo por pilar:\n${c.pilares.map((p) => `- ${p}: un ejemplo concreto del negocio, una idea por pieza y un llamado claro a ${c.canal_pedido}.`).join('\n')}`,
    `## 5 · Canales y mezcla de formatos\nCanal principal: ${c.red_principal}. Mezcla semanal: 2 publicaciones, 1 carrusel cada dos semanas, historias de apoyo 3 veces por semana. Los textos de cada formato respetan el manual de marca vigente.`,
    `## 6 · Calendario macro (13 semanas)\n${semanas.join('\n')}`,
    `## 7 · Medición\nSe mide por semana: mensajes recibidos por ${c.canal_pedido}, publicaciones guardadas y compartidas, y respuestas a las historias. El umbral de éxito lo fija el dueño al ver la semana 4; el plan no inventa una meta numérica sin base.`,
    `## 8 · Lo que falta y quién lo aporta\nHorarios por temporada (los aporta el dueño). Capacidad de entrega en fechas pico (la aporta el dueño). Fotos propias actualizadas del catálogo (las aporta el dueño). Mientras no lleguen, las piezas usan lo que ya está en la ficha y lo dicen.`,
  ]
  // anexos hasta ≈ 25 k caracteres: guía de respuestas a preguntas frecuentes por producto (como el anexo de un plan real)
  let i = 0
  while (bloques.join('\n\n').length < 25000) {
    const [n, p] = c.productos[i % c.productos.length]
    bloques.push(`### Anexo ${i + 1} · Pregunta frecuente sobre ${n}\nCómo se responde: se explica qué incluye ${n}, cuánto cuesta hoy (${precio(c, p)}, precio de la ficha) y cómo pedirlo por ${c.canal_pedido}. Si la persona pregunta algo que la ficha no dice, se responde que se confirma y se anota para la semana siguiente. (Variante ${i + 1}.)`)
    i++
  }
  return bloques.join('\n\n')
}

/** el «pedido del plan» que arma Redactor (B4) para pedir una versión nueva sin recolectar de nuevo (≈ datos reunidos + hechos del dueño + registro) */
export const pedidoDelPlanDe = (c) => `PEDIDO ORIGINAL DEL PLAN · ${c.nombre}\nDatos reunidos: ${c.rubro} en ${c.ciudad}, ${c.pais}; catálogo de ${c.productos.length} líneas; red principal ${c.red_principal}.\nHechos del dueño: el canal de pedido es ${c.canal_pedido}. Registro: ${c.registro}. Referencia del producto: ${c.productos[0][0]}.\n${'Dato reunido de la investigación del negocio y su zona. '.repeat(120)}`

// ───────────────────────── estrategia, calendario, parte de briefs
export function estrategiaDe(c) {
  return {
    pilares: c.pilares.map((p, k) => ({ nombre: p, peso: [0.35, 0.25, 0.2, 0.2][k], objetivo: `generar conversación sobre ${p.toLowerCase()}`, formatos: ['post', 'carrusel', 'historias'], ejemplos: c.productos.slice(k, k + 2).map(([n]) => n) })),
    cadencia: { posts_por_semana: 2, carruseles_cada_semanas: 2, historias_por_semana: 3 },
    tono: reg(c.registro, 'cercano, en tuteo', 'cercano, en voseo'),
    metricas: ['mensajes recibidos', 'guardados', 'compartidos'],
    notas: `Estrategia de contenido para ${c.nombre}: ordena el calendario de 90 días alrededor de ${c.pilares.length} pilares. ${'Cada pilar tiene su ejemplo concreto y su llamado a la acción. '.repeat(6)}`,
  }
}

export function calendarioDe(c) {
  const base = Date.UTC(2026, 10, 2)
  return Array.from({ length: 60 }, (_, k) => {
    const [prod] = c.productos[k % c.productos.length], p = c.pilares[k % c.pilares.length]
    const fecha = new Date(base + Math.floor(k * 1.5) * 86400000).toISOString().slice(0, 10)
    return { fila_id: `f${String(k + 1).padStart(2, '0')}`, fecha, red: k % 5 === 4 ? 'historias' : c.red_principal, formato: k % 7 === 6 ? 'carrusel' : k % 5 === 4 ? 'kit_historias' : 'post_img', pilar: p, tema: `${prod} · ${p}`, objetivo: `llevar a ${c.canal_pedido}` }
  })
}

export function briefsDe(c) {
  const cal = calendarioDe(c).slice(0, 12)
  return cal.map((f) => `- [${f.fila_id}] ${f.formato} · ${f.fecha} · ${f.tema}\n  Idea: mostrar ${f.tema.split(' · ')[0].toLowerCase()} con un ejemplo concreto, una sola idea, llamado a ${c.canal_pedido}. Registro: ${c.registro}. Producto protagonista: ${f.tema.split(' · ')[0]}.`).join('\n') + '\n' + '(Anexo del parte de briefs: criterios de tono y de imagen compartidos por las doce piezas.) '.repeat(12)
}

// ───────────────────────── piezas (una por familia) y material del «cerebro»
export function piezaDe(c, familia, r = c.registro) {
  const [prod, p] = c.productos[0]
  const cta = reg(r, `Escríbenos por ${c.canal_pedido}.`, `Escribinos por ${c.canal_pedido}.`)
  if (familia === 'post_img') return `${prod}: ${reg(r, 'cuéntanos qué necesitas', 'contanos qué necesitás')} y te respondemos hoy. ${precio(c, p)}. ${cta}\n\n#${c.slug.replace(/-/g, '')} #${c.ciudad.toLowerCase()} #${c.rubro.split(' ')[0]}`
  if (familia === 'carrusel') return [1, 2, 3, 4, 5, 6].map((k) => `Lámina ${k}: ${k === 1 ? prod : k === 6 ? cta : `${reg(r, 'Mira', 'Mirá')} el detalle ${k} de ${prod.toLowerCase()}`}`).join('\n') + `\n\nPie de foto: ${prod} en ${c.ciudad}. ${cta}\n\n#${c.slug.replace(/-/g, '')} #${c.ciudad.toLowerCase()}`
  return [1, 2, 3, 4, 5].map((k) => `Historia ${k}: ${k === 1 ? prod : k === 5 ? cta : `${reg(r, 'Descubre', 'Descubrí')} ${c.productos[k % c.productos.length][0].toLowerCase()}`}`).join('\n')
}

export const imagenesDe = (c, familia) => [`https://fotos.test/${c.slug}/${familia}-1.jpg`]

/** el «material del portero» (lo que el cerebro entregaría para esta pieza) */
export const materialDelCerebroDe = (c) => `Material del cerebro de ${c.nombre}: ficha del negocio (${c.rubro}, ${c.ciudad}); catálogo vigente (${c.productos.map(([n]) => n).join(', ')}); hechos del dueño: canal de pedido ${c.canal_pedido}; fotos etiquetadas del catálogo. ${'Trozo del cerebro del cliente con provenance declarada. '.repeat(40)}`

/** los documentos de `contra_que` YA LEÍDOS, tal como los entrega el llamador en `payload.contexto` (el revisor ciego los recibe también) */
export function contextoDe(c, tipo, r = c.registro) {
  const manual = { titulo: 'Manual de marca vigente', funcion: 'manda si dos documentos se contradicen', texto: manualEn(c, r).slice(0, 12000) }
  const plan = { titulo: 'Plan vigente', funcion: 'el artefacto sale de él', texto: planDe(c).slice(0, 12000) }
  const ficha = { titulo: 'Ficha del cliente', funcion: 'hechos del negocio', texto: `${c.nombre} · ${c.rubro} · ${c.ciudad}, ${c.pais} · moneda ${c.moneda} · canal de pedido ${c.canal_pedido} · registro ${r}` }
  const hechos = { titulo: 'Lo que dijo el dueño', funcion: 'correcciones del dueño; mandan sobre la investigación', texto: `El dueño confirma: el canal de pedido es ${c.canal_pedido}; el diferencial es ${c.diferencial}.` }
  const brief = { titulo: 'Brief de la pieza', funcion: 'guía, no regla', texto: briefsDe(c).slice(0, 1200) }
  const portero = { titulo: 'Material del portero', funcion: 'lo que el cerebro entregó para esta pieza', texto: materialDelCerebroDe(c) }
  const estrategia = { titulo: 'Estrategia validada', funcion: 'ordena los temas', texto: JSON.stringify(estrategiaDe(c)) }
  const fechas = { titulo: 'Fechas verificadas', funcion: 'fechas y feriados ya comprobados', texto: 'Fechas del calendario verificadas contra el calendario del país del cliente.' }
  const filas = { titulo: 'Filas del calendario', funcion: 'las filas que originaron cada brief', texto: JSON.stringify(calendarioDe(c).slice(0, 12)) }
  switch (tipo) {
    case 'plan': return [manual, ficha, hechos]
    case 'estrategia': return [manual, plan]
    case 'calendario': return [manual, plan, estrategia, fechas]
    case 'brief': return [manual, plan, filas]
    default: return [manual, plan, brief, portero]
  }
}

/** el artefacto que se revisa, por tipo (lo que `payload.texto` lleva) */
export function artefactoDe(c, tipo, { familia = 'post_img', registro } = {}) {
  const r = registro ?? c.registro
  if (tipo === 'plan') return planDe(c)
  if (tipo === 'estrategia') return JSON.stringify(estrategiaDe(c))
  if (tipo === 'calendario') return JSON.stringify(calendarioDe(c))
  if (tipo === 'brief') return briefsDe(c)
  return piezaDe(c, familia, r)
}

export const clientePorId = (id) => CLIENTES.find((c) => c.id === id)
