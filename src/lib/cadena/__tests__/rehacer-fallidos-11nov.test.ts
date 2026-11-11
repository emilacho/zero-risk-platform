/**
 * 11-nov · GO de Lenovo 16:46 Zúrich (decisión de Emilio 16:43) · respuestas 16:58 · UN ENCARGO FALLIDO QUE YA GASTÓ SE REHACE SOLO CUANDO SU CAUSA YA ESTÁ ARREGLADA.
 * Juzga el agente (la mesa de revisión de fallidos); el código verifica exacto (arreglo en la lista y posterior al fallo · última versión · fecha · tope) y reabre UNA vez por la vía que ya existe.
 * Los 7 puntos de la nota de CC7 («lo que miraré») y la respuesta de Lenovo (sin causa guardada ⇒ se salta y se anota). Contra el almacén en memoria: sin modelo, sin red, US$ 0.
 * DOS clientes de práctica de rubros distintos (A · cafetería · B · clínica veterinaria). Nada aquí nombra a un cliente real.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { Campana } from '../almacen'
import { sumarDias } from '../fechas'
import { relojDeLaCadena } from '../reloj'
import {
  abrirRevisionesDeFallidos, arreglosNuevosPara, avisosDeFallidos, causaCorregida, causaGuardada, CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, INTERRUPTOR_DE_FALLIDOS, leerVeredictos, MAX_JUICIOS, MAX_MESAS_POR_FALLIDO,
  PLAZO_DE_LA_MESA_DE_FALLIDOS_MIN, porQueNoAplica, recibirFallidos, type ArregloPublicado, type EncargoDeLaCampana, type LibretaDeFallidos,
} from '../rehacer-fallidos'

interface Caso { nombre: string; c: ClienteFixture; ahora: string; hoy: string; futura: string; causa: string; arreglo: string; otro: string; familia: string }
const CASOS: Caso[] = [
  {
    nombre: 'A · cafetería', c: clienteA(), ahora: '2026-11-12T15:00:00Z', hoy: '2026-11-12', futura: '2026-11-19', familia: 'carrusel_mesa',
    causa: 'el brazo de imágenes no aceptó el pedido: no pude leer las tarifas de la descripción',
    arreglo: 'fix(imagenes): el lector de tarifas ya no depende de frases fijas; si no puede cotizar falla en el paso 1 sin gastar (#901)',
    otro: 'feat(tablero): la bandeja muestra la hora de cada pieza (#902)',
  },
  {
    nombre: 'B · clínica veterinaria', c: clienteB(), ahora: '2026-11-17T15:00:00Z', hoy: '2026-11-17', futura: '2026-11-23', familia: 'kit_historias',
    causa: 'el paso de armar cortó: la plantilla pedía una foto de portada que el cliente no tiene',
    arreglo: 'fix(oficina): armar usa la primera foto propia cuando falta la de portada (#903)',
    otro: 'docs(cadena): explica el reloj de las :00 y :30 (#904)',
  },
]
const CAMP = (k: Caso) => (k.nombre.startsWith('A') ? '00000000-0000-4000-8000-00000000000a' : '00000000-0000-4000-8000-00000000000b')
const CLI = (k: Caso) => `11111111-1111-4111-8111-${k.nombre.startsWith('A') ? 'aaaaaaaaaaaa' : 'bbbbbbbbbbbb'}`
const PARTE = 'parte-1'
const masMin = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString()

/** un encargo REAL de la oficina en un parte de la campaña */
function encargo(k: Caso, id: string, brief: string, o: Partial<EncargoDeLaCampana> & { fecha?: string | null; causa?: string | null; falloEn?: string } = {}): EncargoDeLaCampana {
  const falloEn = o.falloEn ?? masMin(k.ahora, -600)
  return {
    id, parte_id: PARTE, brief_id: brief, tipo_de_grupo: k.familia, familia: k.familia, estado: 'fallido', gasto_usd: 1.2, version_encargo: 1, creado_en: masMin(falloEn, -30),
    fallo: o.causa === null ? null : { motivo: o.causa ?? k.causa, en: falloEn, pasos_ejecutados: 3, gasto_usd: 1.2 },
    fila: o.fecha === null ? null : { id: `fila-${brief}`, fecha: o.fecha ?? k.futura, hora: '09:00' },
    ...o,
  }
}
interface Op { encendido?: unknown; tope?: number; gastado?: number; fuente?: 'ok' | 'falla'; arreglos?: ArregloPublicado[]; mesa?: 'abre' | 'no_abre'; reabre?: 'ok' | 'no' }
function montar(k: Caso, encargos: EncargoDeLaCampana[], o: Op = {}) {
  const al = new AlmacenMemoria({
    contextos: { [CLI(k)]: { ...contextoDe(k.c), clientId: CLI(k) } },
    config: { flujos: ['wf-cadena', 'wf-vigia'], estado_cadena: 'encendida', ...('encendido' in o ? (o.encendido === undefined ? {} : { [INTERRUPTOR_DE_FALLIDOS]: o.encendido }) : { [INTERRUPTOR_DE_FALLIDOS]: true }) },
  })
  const campana: Campana = {
    id: CAMP(k), client_id: CLI(k), plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
    estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false, tope_gasto_usd: o.tope ?? 40,
  }
  al.campanas.push(campana)
  al.lecturaDeGasto = {
    encargos: [...encargos.map((e) => ({ id: e.id, parte_id: e.parte_id, brief_id: e.brief_id, estado: e.estado, tope_usd: 5, gasto_usd: e.gasto_usd })), ...(o.gastado ? [{ id: 'enc-otro', parte_id: 'parte-otra', brief_id: 'x', estado: 'cerrado', tope_usd: 5, gasto_usd: o.gastado }] : [])],
    partes: [{ id: PARTE, briefs: encargos.map((e) => ({ brief_id: e.brief_id, familia: e.familia, fila_id: null })) }],
    topes_de_familia: { [k.familia]: 5, fallidos_mesa: 2, post_img: 2.5 },
  }
  al.encargosPorCampana = { [CAMP(k)]: encargos }
  const arreglos = o.arreglos ?? [
    { id: 'dpl_viejo', publicado_en: masMin(k.ahora, -900), mensaje: 'fix(viejo): algo de antes del fallo (#900)' },
    { id: 'dpl_arreglo', publicado_en: masMin(k.ahora, -300), mensaje: k.arreglo },
    { id: 'dpl_otro', publicado_en: masMin(k.ahora, -200), mensaje: k.otro },
  ]
  al.fuenteDeArreglos = async (desde) => (o.fuente === 'falla' ? { ok: false, motivo: 'la lista de publicaciones contestó 503' } : { ok: true, arreglos: arreglos.filter((a) => a.publicado_en > desde) })
  let n = 0
  al.mesaDeFallidos = async () => (o.mesa === 'no_abre' ? { estado: 'no_abre', motivo: 'plantilla_inactiva' } : { estado: 'abierta', encargo_id: `mesa-${++n}` })
  let r = 0
  al.reapertura = async () => (o.reabre === 'no' ? { ok: false, motivo: 'la oficina no reabre esta pieza' } : { ok: true, encargo_id: `v2-${++r}` })
  return al
}
const libreta = (al: AlmacenMemoria) => (al.config.get(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS) ?? { fallidos: {}, campanas: {} }) as LibretaDeFallidos
const mesa = (al: AlmacenMemoria, k: Caso, v = 1) => libreta(al).campanas[CAMP(k)]!.mesas[String(v)]!
const entrega = (k: Caso, version: number, texto: string | null) => ({ campana_id: CAMP(k), version, encargo_id: `mesa-${version}`, texto, costo_usd: 0.3, motivo: texto ? null : 'la mesa no produjo nada' })
/** la clave F… de un encargo en la mesa */
const claveDe = (al: AlmacenMemoria, k: Caso, id: string, v = 1) => Object.entries(mesa(al, k, v).fallidos).find(([, x]) => x === id)![0]
const claveDelArreglo = (al: AlmacenMemoria, k: Caso, dpl: string, v = 1) => Object.entries(mesa(al, k, v).arreglos).find(([, x]) => x.id === dpl)?.[0]

describe('el lector y la causa guardada (código puro: formato, no juicio)', () => {
  it('🔴 `F1 · reabrir · A2 · razón` y `F1 · dejar · razón`, con o sin viñeta, comillas o negrita', () => {
    for (const l of ['F1 · reabrir · A2 · el lector ya entiende la tarifa', '- F1 · reabrir · A2 · el lector ya entiende la tarifa', '1. `F1` · **reabrir** · `A2` · el lector ya entiende la tarifa', '  f1 · Reabrir · a2 · el lector ya entiende la tarifa']) {
      expect(leerVeredictos(l), l).toEqual([{ clave: 'F1', accion: 'reabrir', arreglo: 'A2', razon: 'el lector ya entiende la tarifa' }])
    }
    expect(leerVeredictos('**F3** · dejar · ninguno toca la portada')).toEqual([{ clave: 'F3', accion: 'dejar', razon: 'ninguno toca la portada' }])
  })
  it('🔴 lo que no tiene la forma no es un veredicto: prosa con «·», clave que no es F…, reabrir sin un A…, acción desconocida; la primera de una clave repetida gana', () => {
    for (const l of ['La pieza · se ve · bien', 'P1 · reabrir · A1 · x', 'F1 · reabrir · el lector · x', 'F1 · reabrir · A1', 'F1 · rehacer · A1 · x', 'F1 · dejar']) expect(leerVeredictos(l), l).toEqual([])
    expect(leerVeredictos('F1 · dejar · primero\nF1 · reabrir · A1 · después')).toEqual([{ clave: 'F1', accion: 'dejar', razon: 'primero' }])
  })
  it('🔴 la causa guardada exige motivo con texto y fecha legible; sin eso es «sin causa»', () => {
    expect(causaGuardada({ motivo: ' x ', en: '2026-11-11T02:44:44Z' })).toEqual({ motivo: 'x', en: '2026-11-11T02:44:44.000Z' })
    for (const x of [null, undefined, 'texto', [], {}, { motivo: '', en: '2026-11-11T02:44:44Z' }, { motivo: 'x' }, { motivo: 'x', en: 'ayer' }, { motivo: 7, en: '2026-11-11T02:44:44Z' }]) expect(causaGuardada(x), JSON.stringify(x)).toBeNull()
  })
  it('la causa corregida que viaja a la oficina nombra el arreglo, su fecha y la razón, y cabe en 300 caracteres', () => {
    const c = causaCorregida({ id: 'dpl_1', publicado_en: '2026-11-11T05:04:00.000Z', mensaje: 'fix(video): lector de tarifas sin frases fijas (#1026)\n\ncuerpo largo' }, 'r'.repeat(400))
    expect(c.startsWith('Causa corregida por «fix(video): lector de tarifas sin frases fijas (#1026)» (publicado 2026-11-11T05:04Z): ')).toBe(true)
    expect(c.length).toBe(300)
  })
})

describe.each(CASOS)('$nombre', (k) => {
  const base = () => [encargo(k, 'enc-a', 'B1'), encargo(k, 'enc-b', 'B2'), encargo(k, 'enc-sin', 'B3', { causa: null })]

  describe('🔴 (5) apagado de verdad', () => {
    it.each([['ausente', undefined], ['«true» con texto', 'true'], ['1', 1], ['false', false]])('interruptor %s: cero lecturas de encargos, cero lecturas de la fuente, cero mesas, libreta intacta', async (_n, v) => {
      const al = montar(k, base(), { encendido: v })
      expect(await abrirRevisionesDeFallidos(al, k.ahora)).toEqual({ aplicado: [], lineas: [] })
      expect(al.lecturasDeEncargos).toBe(0)
      expect(al.lecturasDeArreglos).toEqual([])
      expect(al.sobresDeFallidos).toEqual([])
      expect(al.config.has(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS)).toBe(false)
      expect(await avisosDeFallidos(al, true)).toEqual([])
    })
    it('el reloj de la cadena (pasada real) con el interruptor apagado tampoco lee nada', async () => {
      const al = montar(k, base(), { encendido: undefined })
      await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, k.ahora)
      expect(al.lecturasDeEncargos + al.lecturasDeArreglos.length + al.sobresDeFallidos.length).toBe(0)
    })
  })

  describe('abrir la mesa', () => {
    it('🔴 los fallidos con causa entran con su causa y SOLO los arreglos posteriores al fallo; el sin causa se salta y se anota, sin pagar', async () => {
      const al = montar(k, base())
      const r = await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toHaveLength(1)
      const s = al.sobresDeFallidos[0]!
      expect(s).toMatchObject({ tipo_de_mesa: 'fallidos', campana_id: CAMP(k), client_id: CLI(k), version: 1, dry_run: false })
      expect(s.marco_texto).toContain(k.causa)
      expect(s.marco_texto).toContain(k.arreglo)
      expect(s.marco_texto).toContain(k.otro)
      expect(s.marco_texto).not.toContain('algo de antes del fallo')
      expect(s.marco_texto).toMatch(/<F…> · reabrir · <A…> · por qué/)
      expect(Object.values(mesa(al, k).fallidos).sort()).toEqual(['enc-a', 'enc-b'])
      expect(libreta(al).fallidos['enc-sin']).toMatchObject({ estado: 'sin_causa' })
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'en_mesa', mesas: 1, juicios: 0 })
      expect(r.lineas.map((l) => l.texto).join('\n')).toMatch(/B3 falló después de gastar US\$ 1\.20 y no guardó su causa; no se rehace sola/)
      // el sin causa no vuelve a avisarse ni a juzgarse
      const al2Lineas = (await abrirRevisionesDeFallidos(al, masMin(k.ahora, 90))).lineas
      expect(al2Lineas.some((l) => /B3/.test(l.texto))).toBe(false)
    })
    it('🔴 (3) la anotación va ANTES de pagar: cuando la mesa se abre, la libreta ya la tiene con sus fallidos «en mesa»', async () => {
      const al = montar(k, base())
      let vista: LibretaDeFallidos | null = null
      al.mesaDeFallidos = async () => { vista = structuredClone(libreta(al)); return { estado: 'abierta', encargo_id: 'mesa-1' } }
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(vista!.campanas[CAMP(k)]!.mesas['1']).toMatchObject({ estado: 'abierta', encargo_id: null })
      expect(vista!.fallidos['enc-a']).toMatchObject({ estado: 'en_mesa' })
    })
    it('🔴 (3) dos pasadas a la vez piden la MISMA versión de mesa (la oficina la abre una sola vez por su nombre) y una tercera no abre otra', async () => {
      const al = montar(k, base())
      await Promise.all([abrirRevisionesDeFallidos(al, k.ahora), abrirRevisionesDeFallidos(al, k.ahora)])
      expect(new Set(al.sobresDeFallidos.map((s) => s.version))).toEqual(new Set([1]))
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 5))
      expect(new Set(al.sobresDeFallidos.map((s) => s.version))).toEqual(new Set([1]))
    })
    it('una mesa abierta y en plazo: no se abre otra; vencida: se da por perdida y sus fallidos vuelven a la próxima', async () => {
      const al = montar(k, base())
      await abrirRevisionesDeFallidos(al, k.ahora)
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, PLAZO_DE_LA_MESA_DE_FALLIDOS_MIN - 1))
      expect(al.sobresDeFallidos).toHaveLength(1)
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, PLAZO_DE_LA_MESA_DE_FALLIDOS_MIN + 1))
      expect(mesa(al, k, 1)).toMatchObject({ estado: 'fallida', motivo: 'la mesa no devolvió un veredicto a tiempo' })
      expect(al.sobresDeFallidos.map((s) => s.version)).toEqual([1, 2])
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'en_mesa', mesas: 2, juicios: 0 })
    })
    it(`🔴 (6) tras ${MAX_MESAS_POR_FALLIDO} mesas sin veredicto legible el fallido queda agotado y se avisa una vez`, async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      let t = k.ahora
      for (let i = 0; i < MAX_MESAS_POR_FALLIDO; i++) { await abrirRevisionesDeFallidos(al, t); await recibirFallidos(al, entrega(k, i + 1, 'no sé qué decir'), t); t = masMin(t, 5) }
      const r = await abrirRevisionesDeFallidos(al, t)
      expect(al.sobresDeFallidos).toHaveLength(MAX_MESAS_POR_FALLIDO)
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'agotado' })
      expect(r.lineas.filter((l) => /B1 quedó sin veredicto/.test(l.texto))).toHaveLength(1)
      expect((await abrirRevisionesDeFallidos(al, masMin(t, 5))).lineas.filter((l) => /B1/.test(l.texto))).toHaveLength(0)
    })
    it('🔴 (6) la fuente ilegible: no abre mesa, no toca la libreta del fallido y se reintenta en la próxima pasada', async () => {
      const al = montar(k, base(), { fuente: 'falla' })
      const r = await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toEqual([])
      expect(libreta(al).fallidos['enc-a']).toBeUndefined()
      expect(r.lineas.map((l) => l.texto)).toContain('fallidos: no se pudo leer la lista de arreglos publicados (la lista de publicaciones contestó 503); se reintenta en la próxima pasada.')
      al.fuenteDeArreglos = async (desde) => ({ ok: true, arreglos: [{ id: 'dpl_arreglo', publicado_en: masMin(k.ahora, -300), mensaje: k.arreglo }].filter((a) => a.publicado_en > desde) })
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 30))
      expect(al.sobresDeFallidos).toHaveLength(1)
    })
    it('sin ningún arreglo posterior al fallo: no se paga una mesa', async () => {
      const al = montar(k, base(), { arreglos: [{ id: 'dpl_viejo', publicado_en: masMin(k.ahora, -900), mensaje: 'fix: antes' }] })
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toEqual([])
    })
    it('la mesa que la oficina no abre (plantilla apagada) devuelve los fallidos a pendiente', async () => {
      const al = montar(k, base(), { mesa: 'no_abre' })
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(mesa(al, k)).toMatchObject({ estado: 'fallida', motivo: 'la mesa no abrió: plantilla_inactiva' })
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', mesas: 1 })
    })
  })

  describe('el filtro exacto: quién se puede rehacer', () => {
    it('🔴 no entra: fecha pasada · versión 3 · hay una versión más nueva · no gastó · no está fallido · sin fila y la campaña ya terminó', () => {
      const ayer = sumarDias(k.hoy, -1)
      const e = encargo(k, 'e', 'B1')
      expect(porQueNoAplica(e, [e], k.hoy, k.c.campana.fecha_fin)).toBeNull()
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { fecha: ayer }), [], k.hoy, k.c.campana.fecha_fin)).toBe('su_fecha_paso')
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { fecha: k.hoy }), [], k.hoy, k.c.campana.fecha_fin)).toBeNull()
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { version_encargo: 3 }), [], k.hoy, k.c.campana.fecha_fin)).toBe('agoto_sus_versiones')
      expect(porQueNoAplica(e, [e, encargo(k, 'e2', 'B1', { version_encargo: 2, estado: 'en_paso' })], k.hoy, k.c.campana.fecha_fin)).toBe('hay_version_mas_nueva')
      expect(porQueNoAplica(e, [e, encargo(k, 'otro-tipo', 'B1', { version_encargo: 2, tipo_de_grupo: 'otra_familia' })], k.hoy, k.c.campana.fecha_fin)).toBeNull()
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { gasto_usd: 0 }), [], k.hoy, k.c.campana.fecha_fin)).toBe('no_gasto')
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { estado: 'cerrado' }), [], k.hoy, k.c.campana.fecha_fin)).toBe('no_es_fallido')
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { fecha: null }), [], k.hoy, ayer)).toBe('la_campana_termino')
      expect(porQueNoAplica(encargo(k, 'e', 'B1', { fecha: null }), [], k.hoy, k.c.campana.fecha_fin)).toBeNull()
    })
    it('lo que no aplica no abre mesa ni llena la libreta', async () => {
      const al = montar(k, [encargo(k, 'e', 'B1', { fecha: sumarDias(k.hoy, -1) }), encargo(k, 'e3', 'B2', { version_encargo: 3 })])
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toEqual([])
      expect(libreta(al).fallidos).toEqual({})
    })
  })

  describe('🔴 (4) el tope ANTES de pagar y otra vez antes de reabrir', () => {
    it('si la mesa no cabe, no se abre (y se dice)', async () => {
      const al = montar(k, base(), { tope: 10, gastado: 9 })
      const r = await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toEqual([])
      expect(r.lineas.map((l) => l.texto).join('\n')).toMatch(/la mesa no cabe en el tope de la campaña/)
    })
    it('si cabe la mesa pero ninguna pieza cabe si se rehace, tampoco se paga la mesa', async () => {
      const al = montar(k, base(), { tope: 10, gastado: 2.4 })
      const r = await abrirRevisionesDeFallidos(al, k.ahora)
      expect(al.sobresDeFallidos).toEqual([])
      expect(r.lineas.map((l) => l.texto).join('\n')).toMatch(/ninguna cabe en el tope de la campaña si se rehace/)
    })
    it('solo entran a la mesa las que caben, en el orden del calendario (la más cercana primero)', async () => {
      const al = montar(k, [encargo(k, 'enc-lejos', 'B1', { fecha: sumarDias(k.futura, 7) }), encargo(k, 'enc-cerca', 'B2', { fecha: k.futura })], { tope: 10, gastado: 0 })
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(Object.values(mesa(al, k).fallidos)).toEqual(['enc-cerca'])
    })
    it('si el tope bajó mientras la mesa juzgaba, el «reabrir» no reabre y queda pendiente', async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      await abrirRevisionesDeFallidos(al, k.ahora)
      al.campanas[0]!.tope_gasto_usd = 3
      await recibirFallidos(al, entrega(k, 1, `${claveDe(al, k, 'enc-a')} · reabrir · ${claveDelArreglo(al, k, 'dpl_arreglo')} · corrige la causa`), k.ahora)
      expect(al.reaperturas).toEqual([])
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', motivo: 'el agente la rehacía, pero no cabe en el tope de la campaña' })
    })
  })

  describe('la vuelta de la mesa', () => {
    it('🔴 «reabrir» con un arreglo de la lista reabre UNA vez por la vía que ya existe, con la causa corregida; «dejar» queda anotado; el resumen sale una vez', async () => {
      const al = montar(k, base())
      await abrirRevisionesDeFallidos(al, k.ahora)
      const A = claveDelArreglo(al, k, 'dpl_arreglo')!
      const texto = `Pienso cada una.\n\n${claveDe(al, k, 'enc-a')} · reabrir · ${A} · el arreglo cambia justo lo que falló\n${claveDe(al, k, 'enc-b')} · dejar · ninguno de estos cambios toca su causa`
      expect(await recibirFallidos(al, entrega(k, 1, texto), k.ahora)).toEqual({ ok: true, estado: 'cerrada' })
      expect(al.reaperturas).toHaveLength(1)
      expect(al.reaperturas[0]!.encargo_id).toBe('enc-a')
      expect(al.reaperturas[0]!.causa).toContain(`Causa corregida por «${k.arreglo}»`)
      expect(al.reaperturas[0]!.causa).toContain('el arreglo cambia justo lo que falló')
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'reabierto', juicios: 1, arreglo_id: 'dpl_arreglo' })
      expect(libreta(al).fallidos['enc-b']).toMatchObject({ estado: 'dejado', juicios: 1, motivo: 'ninguno de estos cambios toca su causa' })
      const av = await avisosDeFallidos(al, true)
      expect(av).toEqual([{ campana_id: CAMP(k), texto: 'fallidos: la mesa revisó 2 pieza(s) que fallaron después de gastar: 1 se rehace(n) porque su causa ya se corrigió, 1 se deja(n) como están' }])
      expect(await avisosDeFallidos(al, true)).toEqual([])
      // la entrega repetida no vuelve a reabrir
      expect(await recibirFallidos(al, entrega(k, 1, texto), k.ahora)).toEqual({ ok: true, ya_cerrada: true, estado: 'cerrada' })
      expect(al.reaperturas).toHaveLength(1)
      // y el reabierto no vuelve a la mesa
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 90))
      expect(al.sobresDeFallidos.slice(1).flatMap((s) => [s.marco_texto]).join('\n')).not.toContain('pieza B1 ')
    })
    it('🔴 (2) un arreglo que NO está en la lista de esta mesa (por clave exacta) no reabre: cuenta el juicio y queda pendiente', async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      await abrirRevisionesDeFallidos(al, k.ahora)
      await recibirFallidos(al, entrega(k, 1, 'F1 · reabrir · A9 · el que arregla esto'), k.ahora)
      expect(al.reaperturas).toEqual([])
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', juicios: 1, motivo: 'el agente citó A9, que no está en la lista que se le pasó' })
    })
    it('🔴 (2) un arreglo de la lista pero ANTERIOR al fallo de esa pieza no la reabre', async () => {
      // dos fallidos en tiempos distintos: el arreglo es posterior al primero pero anterior al segundo
      const t1 = masMin(k.ahora, -600), t2 = masMin(k.ahora, -100)
      const al = montar(k, [encargo(k, 'enc-1', 'B1', { falloEn: t1 }), encargo(k, 'enc-2', 'B2', { falloEn: t2 })], { arreglos: [{ id: 'dpl_medio', publicado_en: masMin(k.ahora, -300), mensaje: k.arreglo }, { id: 'dpl_tarde', publicado_en: masMin(k.ahora, -50), mensaje: k.otro }] })
      await abrirRevisionesDeFallidos(al, k.ahora)
      const medio = claveDelArreglo(al, k, 'dpl_medio')!
      await recibirFallidos(al, entrega(k, 1, `${claveDe(al, k, 'enc-2')} · reabrir · ${medio} · lo corrige`), k.ahora)
      expect(al.reaperturas).toEqual([])
      expect(libreta(al).fallidos['enc-2']).toMatchObject({ estado: 'pendiente', motivo: `el agente citó ${medio}, publicado antes del fallo` })
    })
    it('🔴 (6) una respuesta ilegible NO es «dejar»: la mesa cae, todos vuelven a pendiente y no cuenta como juicio', async () => {
      const al = montar(k, base())
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(await recibirFallidos(al, entrega(k, 1, 'Creo que la primera sí y la segunda no.'), k.ahora)).toEqual({ ok: true, estado: 'fallida' })
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', juicios: 0 })
      expect(libreta(al).fallidos['enc-b']).toMatchObject({ estado: 'pendiente', juicios: 0 })
      expect(al.reaperturas).toEqual([])
      expect(mesa(al, k)).toMatchObject({ estado: 'fallida' })
      // vuelve a la mesa en la pasada siguiente
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 5))
      expect(al.sobresDeFallidos.map((s) => s.version)).toEqual([1, 2])
    })
    it('una entrega sin texto también deja todo pendiente', async () => {
      const al = montar(k, base())
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(await recibirFallidos(al, entrega(k, 1, null), k.ahora)).toEqual({ ok: true, estado: 'fallida' })
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', juicios: 0 })
    })
    it('una pieza que cambió mientras la mesa juzgaba (ya tiene otra versión) no se reabre', async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      await abrirRevisionesDeFallidos(al, k.ahora)
      al.encargosPorCampana![CAMP(k)]!.push(encargo(k, 'enc-a2', 'B1', { version_encargo: 2, estado: 'en_paso' }))
      await recibirFallidos(al, entrega(k, 1, `F1 · reabrir · ${claveDelArreglo(al, k, 'dpl_arreglo')} · lo corrige`), k.ahora)
      expect(al.reaperturas).toEqual([])
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'ya_no_aplica', motivo: 'hay_version_mas_nueva' })
    })
    it('si la oficina no reabre (contesta que no), queda pendiente con su motivo', async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')], { reabre: 'no' })
      await abrirRevisionesDeFallidos(al, k.ahora)
      await recibirFallidos(al, entrega(k, 1, `F1 · reabrir · ${claveDelArreglo(al, k, 'dpl_arreglo')} · lo corrige`), k.ahora)
      expect(al.reaperturas).toHaveLength(1)
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'pendiente', motivo: 'no se pudo reabrir: la oficina no reabre esta pieza' })
    })
    it('una versión de mesa que la cadena no conoce: error, sin tocar nada', async () => {
      const al = montar(k, base())
      await abrirRevisionesDeFallidos(al, k.ahora)
      expect(await recibirFallidos(al, entrega(k, 7, 'F1 · dejar · x'), k.ahora)).toMatchObject({ ok: false })
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'en_mesa' })
    })
  })

  describe('🔴 (1) «dejar» no es definitivo: se vuelve a juzgar solo con arreglos NUEVOS, hasta el tope', () => {
    it('sin arreglos nuevos no se vuelve a pagar; con uno nuevo, vuelve a la mesa y solo ve lo nuevo', async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      await abrirRevisionesDeFallidos(al, k.ahora)
      await recibirFallidos(al, entrega(k, 1, 'F1 · dejar · ninguno la corrige'), k.ahora)
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 30))
      expect(al.sobresDeFallidos).toHaveLength(1)
      const nuevo = { id: 'dpl_nuevo', publicado_en: masMin(k.ahora, 40), mensaje: 'fix(oficina): el arreglo que faltaba (#999)' }
      const viejos = [{ id: 'dpl_arreglo', publicado_en: masMin(k.ahora, -300), mensaje: k.arreglo }]
      al.fuenteDeArreglos = async (desde) => ({ ok: true, arreglos: [...viejos, nuevo].filter((a) => a.publicado_en > desde) })
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 60))
      expect(al.sobresDeFallidos).toHaveLength(2)
      expect(al.sobresDeFallidos[1]!.marco_texto).toContain('el arreglo que faltaba')
      expect(al.sobresDeFallidos[1]!.marco_texto).not.toContain(k.arreglo)
    })
    it(`tras ${MAX_JUICIOS} veredictos sin rehacerla, queda agotado`, async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      const lista: ArregloPublicado[] = []
      let t = k.ahora
      for (let i = 0; i < MAX_JUICIOS; i++) {
        lista.push({ id: `dpl_${i}`, publicado_en: masMin(t, -10), mensaje: `fix: cambio ${i}` })
        al.fuenteDeArreglos = async (desde) => ({ ok: true, arreglos: lista.filter((a) => a.publicado_en > desde) })
        await abrirRevisionesDeFallidos(al, t)
        await recibirFallidos(al, entrega(k, i + 1, 'F1 · dejar · no la corrige'), t)
        t = masMin(t, 120)
      }
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'agotado', juicios: MAX_JUICIOS })
      lista.push({ id: 'dpl_mas', publicado_en: masMin(t, -10), mensaje: 'fix: otro' })
      await abrirRevisionesDeFallidos(al, t)
      expect(al.sobresDeFallidos).toHaveLength(MAX_JUICIOS)
    })
    it(`🔴 un fallido que sigue «pendiente» con ${MAX_JUICIOS} juicios (p. ej. «la rehacía, pero no cabe en el tope» tres veces) no vuelve a la mesa: queda agotado`, async () => {
      const al = montar(k, [encargo(k, 'enc-a', 'B1')])
      al.config.set(CLAVE_DE_LA_LIBRETA_DE_FALLIDOS, { fallidos: { 'enc-a': { campana_id: CAMP(k), estado: 'pendiente', juicios: MAX_JUICIOS, mesas: MAX_JUICIOS - 1, visto_hasta: null, motivo: 'el agente la rehacía, pero no cabe en el tope de la campaña', actualizado_en: k.ahora } }, campanas: {} })
      await abrirRevisionesDeFallidos(al, masMin(k.ahora, 5))
      expect(al.sobresDeFallidos).toHaveLength(0)
      expect(libreta(al).fallidos['enc-a']).toMatchObject({ estado: 'agotado', juicios: MAX_JUICIOS, motivo: `${MAX_JUICIOS} veredictos y ninguno la rehízo` })
    })
    it('arreglosNuevosPara: después del fallo y después de lo ya visto', () => {
      const causa = { motivo: 'x', en: '2026-11-11T02:00:00.000Z' }
      const lista = [{ id: '1', publicado_en: '2026-11-11T01:00:00.000Z', mensaje: 'a' }, { id: '2', publicado_en: '2026-11-11T03:00:00.000Z', mensaje: 'b' }, { id: '3', publicado_en: '2026-11-11T05:00:00.000Z', mensaje: 'c' }]
      expect(arreglosNuevosPara(causa, undefined, lista).map((a) => a.id)).toEqual(['2', '3'])
      expect(arreglosNuevosPara(causa, { campana_id: 'c', estado: 'dejado', juicios: 1, mesas: 1, visto_hasta: '2026-11-11T03:00:00.000Z', motivo: null, actualizado_en: '' }, lista).map((a) => a.id)).toEqual(['3'])
    })
  })

  it('el reloj de la cadena corre la revisión en una pasada real y nunca en una en seco', async () => {
    const al = montar(k, base())
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', seco: true }, k.ahora)
    expect(al.sobresDeFallidos).toEqual([])
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v2' }, k.ahora)
    expect(al.sobresDeFallidos).toHaveLength(1)
  })
  it('una campaña de ensayo en seco no entra', async () => {
    const al = montar(k, base())
    al.campanas[0]!.seco = true
    await abrirRevisionesDeFallidos(al, k.ahora)
    expect(al.lecturasDeEncargos).toBe(0)
    expect(al.sobresDeFallidos).toEqual([])
  })
})
