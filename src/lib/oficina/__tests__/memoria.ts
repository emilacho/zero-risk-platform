/** ayuda de pruebas: puertos EN MEMORIA y un «modelo simulado» (guion por paso). Sin red, sin base, sin modelo real. */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { POST_IMG } from '../plantillas/post-img'
import { avanzar, recibirResultado, type Respuesta } from '../orquestador'
import type { Almacen, Cambios, Encargo, FuentesCompletas, Puertos, TurnoRegistrado } from '../puertos'
import type { FotoEtiquetada } from '../fotos'
import type { FilaDeFormato } from '../entrega'
import type { ConfigDeOficina } from '../sobre'
import type { Plantilla } from '../tipos'

export const CLIENTE = 'cliente-de-prueba'
export const PARTE = '426af72d-12c0-471c-9fda-2a2978db5175'
const aqui = path.join(__dirname, 'fixtures')
export const PARTE_REAL = fs.readFileSync(path.join(aqui, 'parte-extracto.md'), 'utf8')
export const FOTOS = (JSON.parse(fs.readFileSync(path.join(aqui, 'etiquetas-16-fotos.json'), 'utf8')) as FotoEtiquetada[]).map((f) => ({ ...f, url: `https://fotos.test/${f.id}.jpg` }))
/** una parte de la que el protagonista es otro producto (para la rama de foto real) */
export const PARTE_OTRO_PRODUCTO = PARTE_REAL.replace('El Ceviche Náufrago ($7.00): pescado curtido en leche de tigre, salsa de maní, aguacate. UNO. No el encebollado, no el combo, no la historia de origen en esta pieza.', 'El Encebollado Náufrago ($5.50). UNO. No el ceviche, no el combo.').replace(/plato de ceviche/g, 'plato de encebollado')

export function png(w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]) }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(10))), chunk('IEND', Buffer.alloc(0))])
}

export const FUENTES: FuentesCompletas = {
  cliente_nombre: 'Cliente de práctica',
  manual_texto: 'Voz directa y económica con las palabras. Tutea siempre, nunca vos. Copy corto: una idea por frase.',
  plan_texto: 'Plan de 90 días: serie de posts de producto antes de la pauta.',
  fuentes: { palabras_prohibidas: ['premium', 'calidad garantizada', 'el mejor', 'gourmet', 'artesanal'], telefonos: ['+593 997 744 288'], handles: ['@naufrago.ec'], precios: ['7.00', '5.50'], competidores: ['Pez Azul'], registro: 'tuteo' },
  propios: { telefonos: ['+593 997 744 288'], handles: ['@naufrago.ec'], urls: ['https://www.naufrago.ec'], marcas_ajenas: ['rukutu'] },
  fotos: FOTOS, usos: {}, vocabulario_de_productos: ['Ceviches', 'Encebollados', 'Chifle', 'Pan'], zona: 'America/Guayaquil',
}
export const FORMATO_1X1: FilaDeFormato = { red: 'instagram', formato: 'foto_1x1', ancho: 1080, alto: 1080, tipos_archivo: ['png', 'jpeg'], peso_max_mb: 8, n_min: 1, n_max: 1, texto_max: 2200, hashtags_max: 30, pasos_publicacion: ['Descargar la imagen', 'Pegar el texto', 'Programar'], verificado: false }

export interface Memoria {
  P: Puertos
  encargos: Map<string, Encargo>
  turnos: Map<string, Map<number, TurnoRegistrado>>
  artefactos: Array<{ encargo_id: string; tipo: string; version: number; sha256: string }>
  gastos: NonNullable<Cambios['gastos']>
  usos: Array<{ foto_id: string; rol: string | null }>
  llamadas: { imagen: number; imagenReal: number; revisor: number; revisorReal: number; salida: number; bandeja: Array<Record<string, unknown>>; salidas: Array<Record<string, unknown>>; avisos: Array<{ canal: string; texto: string }>; archivos: string[]; guardadoDeArchivos: number }
  config: ConfigDeOficina
  plantilla: { plantilla: Plantilla; activo: boolean } | null
  /** guion del revisor externo: texto por llamada */
  revisorTexto: (n: number) => { ok: true; texto: string; costo_usd: number; modelo: string } | { ok: false; error: string }
  imagenFalla: (n: number) => boolean
}

export function crearMemoria(o: { parte?: string; config?: Partial<ConfigDeOficina>; fuentes?: Partial<FuentesCompletas>; tope?: number } = {}): Memoria {
  const m: Memoria = {
    encargos: new Map(), turnos: new Map(), artefactos: [], gastos: [], usos: [],
    llamadas: { imagen: 0, imagenReal: 0, revisor: 0, revisorReal: 0, salida: 0, bandeja: [], salidas: [], avisos: [], archivos: [], guardadoDeArchivos: 0 },
    config: { estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [], ...(o.config ?? {}) },
    plantilla: { plantilla: JSON.parse(JSON.stringify(POST_IMG)), activo: true },
    revisorTexto: () => ({ ok: true, texto: JSON.stringify({ fichas: [] }), costo_usd: 0.1, modelo: 'revisor-simulado' }),
    imagenFalla: () => false,
    P: undefined as unknown as Puertos,
  }
  const almacen: Almacen = {
    leerConfig: async () => m.config,
    leerPlantilla: async () => m.plantilla,
    leerFormato: async (red, formato) => (red === 'instagram' && formato === 'foto_1x1' ? FORMATO_1X1 : null),
    crearEncargo: async (n) => {
      const dup = [...m.encargos.values()].find((x) => x.parte_id === n.parte_id && x.brief_id === n.brief_id && x.tipo_de_grupo === n.tipo_de_grupo && x.version_encargo === 1)
      if (dup) return { ok: true, encargo: dup, nuevo: false }
      const id = `00000000-0000-4000-8000-${String(m.encargos.size + 1).padStart(12, '0')}`
      const e: Encargo = { id, client_id: n.client_id, parte_id: n.parte_id, brief_id: n.brief_id, tipo_de_grupo: n.tipo_de_grupo, familia: n.familia, version_encargo: 1, estado: 'abierto', estado_del_motor: n.estado_del_motor, con_desacuerdo: false, imagen_generada: false, tope_usd: o.tope ?? n.tope_usd, gasto_usd: 0, dry_run: n.dry_run, prueba: n.prueba, sala_ref: n.sala_ref, salida_output_id: null, hitl_queue_id: null }
      m.encargos.set(id, e)
      return { ok: true, encargo: e, nuevo: true }
    },
    leerEncargo: async (id) => { const e = m.encargos.get(id); return e ? JSON.parse(JSON.stringify(e)) : null },
    turnoAbierto: async (id) => [...(m.turnos.get(id)?.values() ?? [])].find((t) => t.estado === 'corriendo') ?? null,
    guardar: async (c) => {
      const e = m.encargos.get(c.encargo_id)!
      e.estado_del_motor = JSON.parse(JSON.stringify(c.estado_del_motor)); e.gasto_usd = c.gasto_usd
      if (c.estado) e.estado = c.estado
      if (c.con_desacuerdo !== undefined) e.con_desacuerdo = c.con_desacuerdo
      if (c.imagen_generada !== undefined) e.imagen_generada = c.imagen_generada
      if (c.salida_output_id !== undefined) e.salida_output_id = c.salida_output_id
      if (c.hitl_queue_id !== undefined) e.hitl_queue_id = c.hitl_queue_id
      if (c.turno) { const t = m.turnos.get(c.encargo_id) ?? new Map(); t.set(c.turno.n, { ...(t.get(c.turno.n) ?? {}), ...c.turno }); m.turnos.set(c.encargo_id, t) }
      if (c.artefacto) m.artefactos.push({ encargo_id: c.encargo_id, tipo: c.artefacto.tipo, version: c.artefacto.version, sha256: c.artefacto.sha256 })
      for (const g of c.gastos ?? []) { if (g.ref_tabla && g.ref_id && m.gastos.some((x) => x.ref_tabla === g.ref_tabla && x.ref_id === g.ref_id)) continue; m.gastos.push(g) }
      for (const u of c.usos_de_fotos ?? []) m.usos.push(u)
    },
  }
  m.P = {
    almacen, ahora: () => new Date('2026-10-10T12:00:00Z'),
    fuentes: async () => ({ ...FUENTES, ...(o.fuentes ?? {}) }),
    parte: async () => ({ texto: o.parte ?? PARTE_REAL }),
    imagen: async (p) => {
      m.llamadas.imagen++
      if (!p.dry_run) m.llamadas.imagenReal++
      if (m.imagenFalla(m.llamadas.imagen)) return { ok: false, error: 'proveedor caído' }
      return p.dry_run ? { ok: true, url: `https://dry.test/${m.llamadas.imagen}.png`, generation_id: `dry-${m.llamadas.imagen}`, costo_usd: 0 } : { ok: true, url: `https://img.test/${m.llamadas.imagen}.png`, generation_id: `g-${m.llamadas.imagen}`, costo_usd: 0.014 }
    },
    revisor: async (p) => { m.llamadas.revisor++; if (!p.dry_run) m.llamadas.revisorReal++; return m.revisorTexto(m.llamadas.revisor) },
    descargar: async () => png(1024, 1024),
    guardarArchivos: async (ruta, archivos) => { m.llamadas.guardadoDeArchivos++; m.llamadas.archivos.push(...archivos.map((a) => a.nombre)); return { ok: true, urls: Object.fromEntries(archivos.map((a) => [a.nombre, `https://bucket.test/${ruta}/${a.nombre}`])) } },
    salida: async (p) => { m.llamadas.salida++; m.llamadas.salidas.push(p as never); return { ok: true, output_id: '99999999-9999-4999-8999-999999999999' } },
    bandeja: async (p) => { m.llamadas.bandeja.push(p as never); return { ok: true, id: '88888888-8888-4888-8888-888888888888' } },
    avisar: async (p) => { m.llamadas.avisos.push({ canal: p.canal, texto: p.texto }) },
  }
  return m
}

export type Guion = Record<string, (n: number, tarea: string) => { texto?: string; error?: string; costo_usd?: number }>

/** recorre el encargo: cada vez que el orquestador espera a un empleado, responde el guion; devuelve la última respuesta y el rastro de pasos */
export async function correr(M: Memoria, encargoId: string, guion: Guion, max = 60): Promise<{ ultima: Respuesta; pasos: string[]; tareas: Record<string, string[]>; pedidos: Record<string, Array<Record<string, unknown>>> }> {
  let ultima = await avanzar(M.P, encargoId)
  const pasos: string[] = []
  const tareas: Record<string, string[]> = {}
  const pedidos: Record<string, Array<Record<string, unknown>>> = {}
  const veces: Record<string, number> = {}
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; pedido?: { task?: string } & Record<string, unknown> }
    ;(pedidos[t.paso] ??= []).push((t.pedido ?? {}) as Record<string, unknown>)
    pasos.push(t.paso)
    veces[t.paso] = (veces[t.paso] ?? 0) + 1
    const tarea = t.pedido?.task ?? ''
    ;(tareas[t.paso] ??= []).push(tarea)
    const g = guion[t.paso]
    if (!g) throw new Error(`el guion no tiene respuesta para «${t.paso}»`)
    const r = g(veces[t.paso], tarea)
    ultima = await recibirResultado(M.P, encargoId, t.n, { ...r, workflow_execution_id: `ex-${t.n}`, costo_usd: r.costo_usd ?? 0.07 })
  }
  return { ultima, pasos, tareas, pedidos }
}

// ── respuestas de modelo simuladas (JSON)
const j = (x: unknown) => JSON.stringify(x)
export const REGLAS_CEVICHE = {
  obligatorio: [
    { id: 'o1', texto: 'el plato completo, no recortado', claves: ['plato completo', 'plato entero'], cita: 'El plato aparece completo, no recortado.' },
    { id: 'o2', texto: 'el plato de ceviche ocupa el centro', claves: ['ceviche'], cita: 'El plato de ceviche ocupa el centro del encuadre.' },
  ],
  prohibido: [
    { id: 'p1', texto: 'personas', claves: ['personas'], cita: 'No aparecen personas' },
    { id: 'p2', texto: 'logo sobre el plato', claves: ['logo'], cita: 'no aparece el logo superpuesto sobre el plato' },
    { id: 'p3', texto: 'texto quemado', claves: ['texto'], cita: 'no aparece texto quemado en la imagen' },
  ],
}
export const direccionGenerada = (reglas = REGLAS_CEVICHE) => j({ resumen: 'Luz natural lateral, madera clara, plato completo al centro', estilo: 'fotografía de comida directa', decision: { modo: 'generada', motivo: 'ninguna foto real sirve para este brief' }, reglas_de_imagen: reglas })
export const direccionReal = (foto_id: string) => j({ resumen: 'Foto real del producto, luz natural', estilo: 'sin retoque', decision: { modo: 'real', foto_id, motivo: 'la foto muestra el producto sin marcas ajenas' }, reglas_de_imagen: { obligatorio: [], prohibido: [] } })
export const BUENOS_PROMPTS = j({ prompts: [
  { prompt: 'Un plato de ceviche con el plato completo visible, luz natural lateral, mesa de madera clara. Sin personas, sin texto, sin logos.', idea_en_una_linea: 'Cenital con luz de ventana' },
  { prompt: 'Ceviche en un bowl, plato entero a nivel de mesa, fondo de cocina real desenfocado. Sin personas, sin texto, sin logo.', idea_en_una_linea: 'Nivel de mesa' },
  { prompt: 'Un ceviche en un bowl.', idea_en_una_linea: 'No cubre lo obligatorio' },
], tamaño: 'Feed de Instagram' })
export const observacion = (indices: number[], opts: { falta?: string; ajeno?: string } = {}) => j({
  imagenes: indices.map((indice) => ({
    indice, reglas: [
      { id: 'o1', presente: opts.falta === 'o1' ? false : true, evidencia: 'visible' }, { id: 'o2', presente: true, evidencia: 'centro' },
      { id: 'p1', presente: false, evidencia: 'no hay' }, { id: 'p2', presente: false, evidencia: 'no hay' }, { id: 'p3', presente: false, evidencia: 'no hay' },
    ],
    texto_en_imagen: opts.ajeno ? [opts.ajeno] : [], marcas: [], personas: 0, producto: 'ceviche',
  })),
  preferencia: indices,
})
export const PIEZA_OK = j({ pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288.', hashtags: ['#ceviche', '#olon'], llamado: 'Pídelo por WhatsApp', nota_para_quien_publica: 'Publicar en el grid.' })
export const FICHAS_VACIAS = j({ fichas: [] })
