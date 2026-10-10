/**
 * Dos clientes SINTÉTICOS, distintos en todo lo que importa (diseño v2 §11): rubro, ciudad, horario, redes, pilares,
 * frecuencia, anuncios, fechas especiales. La batería de pruebas corre IGUAL con los dos, sin parámetros distintos.
 * Nada de esto es un cliente real (se prohíben nombres reales en `src/lib/cadena/`; ver prueba de generalidad).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expandirPatron, fusionarTanda } from '../expandir-patron'
import type { Estrategia, Fila, FormatosPorRed, PiezaAgente, Referencia, SedeInfo, TandaAgente } from '../tipos'

const RAIZ = join(__dirname, '..', '..', '..', '..')

/** Los formatos salen de la SIEMBRA REAL de la migración (así prueba y tabla no se separan). */
export function formatosDeLaMigracion(): FormatosPorRed {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610090200_cadena_tablas.sql'), 'utf8')
  const out: FormatosPorRed = {}
  for (const m of sql.matchAll(/\('(instagram|facebook|tiktok|linkedin|youtube|whatsapp)',\s*'(\w+)',\s*(\d+),\s*'(opera|espera_brazo)',\s*(\d+)\)/g)) {
    ;(out[m[1]] ??= []).push({ formato: m[2], lead_dias: Number(m[3]), produccion: m[4] as 'opera' | 'espera_brazo', max_por_dia: Number(m[5]) })
  }
  return out
}

export interface ClienteFixture {
  clientId: string
  campana: { fecha_inicio: string; fecha_fin: string; tanda: number; semanas: number[] }
  planTexto: string
  estrategia: Estrategia
  sedes: SedeInfo[]
  referencias: Referencia[]
  forbiddenWords: string[]
  conocidos: string[]
  ahora: string
  /** pieza «extra» que sirve de ancla para inyectar errores: slot y red existentes */
  anclas: { lunes: string; jueves: string; sabado: string }
}

const horarioContinuo = (dias: number[], abre: string, cierra: string) => Object.fromEntries(dias.map((d) => [d, [{ abre, cierra }]]))

// ───────────────────────── Cliente A · cafetería de barrio (sintética) · jue–lun 07:00–15:00 · Instagram + Facebook · con anuncios
const PLAN_A = [
  'Plan de 90 días de una cafetería de barrio.',
  'Los canales son Instagram y Facebook. TikTok queda fuera del plan.',
  'Revisión de resultados los días 21, 42, 63 y 84.',
  'Los 9 posts del grid se publican antes del primer anuncio.',
  'El primer anuncio sale entre los días 8 y 14.',
  'Se publican 3 posts por semana en Instagram y 1 en Facebook.',
  'La sede abre de jueves a lunes de 07:00 a 15:00.',
  'Precio del café de la casa: $2,50.',
].join(' ')

export function clienteA(): ClienteFixture {
  const estrategia: Estrategia = {
    canales: [
      { red: 'instagram', rol: 'principal', motivo: 'ahí está el público', frecuencia: { feed_semana: 3, historias_semana: 0, anuncios_semana: 0 }, formatos: ['foto', 'carrusel', 'anuncio_imagen'] },
      { red: 'facebook', rol: 'replica', motivo: 'réplica del feed', frecuencia: { feed_semana: 1, historias_semana: 0, anuncios_semana: 0 }, formatos: ['foto'] },
      { red: 'tiktok', rol: 'no', motivo: 'fuera del plan', frecuencia: { feed_semana: 0, historias_semana: 0, anuncios_semana: 0 }, formatos: [] },
    ],
    excluidos: [{ red: 'tiktok', cita_plan: 'TikTok queda fuera del plan' }],
    pilares: [{ clave: 'menu', nombre: 'La carta', pct: 40 }, { clave: 'historia', nombre: 'Nuestra historia', pct: 30 }, { clave: 'equipo', nombre: 'El equipo', pct: 30 }],
    fases: [{ clave: 'f1', dia_desde: 1, dia_hasta: 30, objetivo: 'presentar', cita_plan: 'Plan de 90 días' }],
    hitos: [21, 42, 63, 84].map((d) => ({ clave: `rev-${d}`, dia: d, tipo: 'revision' as const, cita_plan: 'Revisión de resultados los días 21, 42, 63 y 84' })),
    dependencias: [{ antes: 'grid', despues: 'anuncio', regla: '9 posts antes del primer anuncio', cita_plan: 'Los 9 posts del grid se publican antes del primer anuncio' }],
    fechas_que_importan: [{ tipo: 'feriados locales', ambito: 'ciudad', origen: 'estrategia', motivo: 'la cafetería vende menos en feriados largos' }],
    patron_semanal: [
      { slot: 'a', dia_semana: 1, hora: '12:00', red: 'instagram', formato: 'foto', pilar: 'menu', requiere_abierto: true, sede: 'centro' },
      { slot: 'b', dia_semana: 4, hora: '09:00', red: 'instagram', formato: 'carrusel', pilar: 'historia', requiere_abierto: true, sede: 'centro' },
      { slot: 'c', dia_semana: 6, hora: '10:00', red: 'instagram', formato: 'foto', pilar: 'equipo', requiere_abierto: false, sede: 'centro' },
      { slot: 'd', dia_semana: 4, hora: '11:00', red: 'facebook', formato: 'foto', pilar: 'menu', requiere_abierto: true, sede: 'centro' },
    ],
    piezas_fijas: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ clave: `grid-${n}`, semana: Math.ceil(n / 3), slot: ['a', 'b', 'c'][(n - 1) % 3], tema: `Pieza ${n} del grid`, refs: [] })),
    pendientes: [],
    alertas: [],
  }
  return {
    clientId: 'cliente-a-practica',
    campana: { fecha_inicio: '2026-10-12', fecha_fin: '2027-01-09', tanda: 1, semanas: [1, 2, 3, 4] },
    planTexto: PLAN_A,
    estrategia,
    sedes: [{ clave: 'centro', nombre: 'Café Brisa Centro', telefono: '0990000001', horario: horarioContinuo([4, 5, 6, 7, 1], '07:00', '15:00') }],
    referencias: [
      { id: 'plan-a', client_id: 'cliente-a-practica', origen: 'plan', texto: PLAN_A },
      { id: 'manual-a', client_id: 'cliente-a-practica', origen: 'manual', texto: 'Tono cercano. Café de la casa. Servimos desayunos.' },
      { id: 'ficha-precio', client_id: 'cliente-a-practica', origen: 'ficha', firmada: true, vigente: true, texto: 'El café de la casa cuesta $2,50.' },
      { id: 'trozo-dudoso', client_id: 'cliente-a-practica', origen: 'trozo', confianza: 'untrusted', texto: 'El pan pesa 45 g.' },
    ],
    forbiddenWords: ['barato', 'gratis'],
    conocidos: ['Café Brisa', 'centro'],
    ahora: '2026-10-09',
    anclas: { lunes: 'a', jueves: 'b', sabado: 'c' },
  }
}

// ───────────────────────── Cliente B · clínica veterinaria (sintética) · lun–sáb 08:00–18:00 · IG + FB + LinkedIn · SIN anuncios · SIN tipos de fecha
const PLAN_B = [
  'Plan de 90 días de una clínica veterinaria.',
  'Los canales son Instagram, Facebook y LinkedIn. TikTok queda fuera del plan.',
  'No hay inversión en anuncios pagos.',
  'Revisión de resultados los días 30, 60 y 90.',
  'Se publican 2 posts por semana en Instagram, 1 en Facebook y 1 en LinkedIn.',
  'La clínica atiende de lunes a sábado de 08:00 a 18:00. Domingo cerrado.',
].join(' ')

export function clienteB(): ClienteFixture {
  const estrategia: Estrategia = {
    canales: [
      { red: 'instagram', rol: 'principal', motivo: 'educación', frecuencia: { feed_semana: 2, historias_semana: 0, anuncios_semana: 0 }, formatos: ['foto', 'carrusel'] },
      { red: 'facebook', rol: 'replica', motivo: 'comunidad', frecuencia: { feed_semana: 1, historias_semana: 0, anuncios_semana: 0 }, formatos: ['foto'] },
      { red: 'linkedin', rol: 'replica', motivo: 'alianzas', frecuencia: { feed_semana: 1, historias_semana: 0, anuncios_semana: 0 }, formatos: ['texto'] },
      { red: 'tiktok', rol: 'no', motivo: 'fuera del plan', frecuencia: { feed_semana: 0, historias_semana: 0, anuncios_semana: 0 }, formatos: [] },
    ],
    excluidos: [{ red: 'tiktok', cita_plan: 'TikTok queda fuera del plan' }],
    pilares: [{ clave: 'educacion', nombre: 'Educación', pct: 50 }, { clave: 'equipo', nombre: 'El equipo', pct: 25 }, { clave: 'casos', nombre: 'Casos', pct: 25 }],
    fases: [{ clave: 'f1', dia_desde: 1, dia_hasta: 90, objetivo: 'posicionar', cita_plan: 'Plan de 90 días' }],
    hitos: [30, 60, 90].map((d) => ({ clave: `rev-${d}`, dia: d, tipo: 'revision' as const, cita_plan: 'Revisión de resultados los días 30, 60 y 90' })),
    dependencias: [],
    fechas_que_importan: [], // lo normal por defecto: a este negocio no le importa ninguna fecha especial
    patron_semanal: [
      { slot: 'a', dia_semana: 2, hora: '10:00', red: 'instagram', formato: 'carrusel', pilar: 'educacion', requiere_abierto: false, sede: 'unica' },
      { slot: 'b', dia_semana: 5, hora: '16:00', red: 'instagram', formato: 'foto', pilar: 'equipo', requiere_abierto: true, sede: 'unica' },
      { slot: 'c', dia_semana: 3, hora: '12:00', red: 'facebook', formato: 'foto', pilar: 'casos', requiere_abierto: false, sede: 'unica' },
      { slot: 'd', dia_semana: 4, hora: '09:00', red: 'linkedin', formato: 'texto', pilar: 'educacion', requiere_abierto: false, sede: 'unica' },
    ],
    piezas_fijas: [],
    pendientes: [],
    alertas: [],
  }
  return {
    clientId: 'cliente-b-practica',
    campana: { fecha_inicio: '2026-11-09', fecha_fin: '2027-02-06', tanda: 1, semanas: [1, 2, 3, 4] },
    planTexto: PLAN_B,
    estrategia,
    sedes: [{ clave: 'unica', nombre: 'Clínica Altozano', telefono: '0990000002', horario: horarioContinuo([1, 2, 3, 4, 5, 6], '08:00', '18:00') }],
    referencias: [
      { id: 'plan-b', client_id: 'cliente-b-practica', origen: 'plan', texto: PLAN_B },
      { id: 'manual-b', client_id: 'cliente-b-practica', origen: 'manual', texto: 'Tono profesional y cálido. Atendemos perros y gatos.' },
    ],
    forbiddenWords: ['milagroso'],
    conocidos: ['Clínica Altozano', 'unica'],
    ahora: '2026-10-09',
    anclas: { lunes: 'a', jueves: 'd', sabado: 'b' },
  }
}

/** Una pieza del agente para un slot del patrón, con tema sin cifras ni afirmaciones. */
export function piezaBuena(c: ClienteFixture, semana: number, slot: string, tema: string): PiezaAgente {
  const s = c.estrategia.patron_semanal.find((x) => x.slot === slot)!
  const fija = c.estrategia.piezas_fijas.find((p) => p.semana === semana && p.slot === slot)
  return {
    semana, dia_semana: s.dia_semana, slot, hora: s.hora, red: s.red, formato: s.formato, pilar: s.pilar, tema: fija ? fija.tema : tema,
    sede: s.sede, requiere_abierto: s.requiere_abierto, depende_de: [], pieza_fija: fija?.clave ?? '', datos: [], pendientes: [],
  }
}

export function tandaBuena(c: ClienteFixture): TandaAgente {
  const piezas: PiezaAgente[] = []
  for (const semana of c.campana.semanas) for (const s of c.estrategia.patron_semanal) piezas.push(piezaBuena(c, semana, s.slot, `Tema de ${s.pilar}, semana ${semana}`))
  return { piezas, ajustes_al_patron: [] }
}

export function filasDe(c: ClienteFixture, t: TandaAgente, formatos: FormatosPorRed): Fila[] {
  const esq = expandirPatron(c.estrategia, c.campana, c.campana.semanas, c.campana.tanda, formatos)
  return fusionarTanda(esq, t, c.estrategia, c.campana, c.campana.tanda, formatos).filas
}

/** el contexto que el almacén real armaría de la base, para las pruebas de los manejadores */
export function contextoDe(c: ClienteFixture): import('../almacen').ContextoDelCliente {
  return {
    clientId: c.clientId, nombreDelNegocio: c.conocidos[0] ?? 'Negocio de práctica', pais: 'pais-de-practica', zonaHoraria: 'UTC', planTexto: c.planTexto,
    manualTexto: c.referencias.find((r) => r.origen === 'manual')?.texto ?? '', forbiddenWords: c.forbiddenWords, sedes: c.sedes, referencias: c.referencias, fechaDelPlan: '2026-10-08',
  }
}
