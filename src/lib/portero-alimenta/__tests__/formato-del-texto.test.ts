/**
 * INFORMES CON FORMATO (encargo 05-nov, firmado por Emilio) · US$ 0 · base falsa · sin modelo.
 * Regla general: el texto se guarda TAL CUAL llega (saltos de línea, listas, tablas, encabezados). Nada se aplana al guardar;
 * la versión de una línea (`que_es`, citas cortas) se DERIVA, sin tocar el original.
 * Un informe entra por la puerta y sale idéntico por la consulta, el pedido y `contexto_del_cliente`; lo mismo una respuesta del dueño.
 */
import { describe, expect, it } from 'vitest'
import { limpiarComentario } from '../comentarios-de-redes'
import { rutaConsultar } from '../consultar'
import { adjuntoDelCliente } from '../contexto-del-cliente'
import { rutaDueno, sinDatosPersonales, unaLinea, type DepsDeDueno } from '../dueno'
import { rutaInforme } from '../informes'
import { rutaLeerPedido } from '../pedidos'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf-mesa', workflow_execution_id: 'ex-1' }
const CITADA = '11111111-1111-4111-8111-111111111111'
const PEDIDO = '22222222-2222-4222-8222-222222222222'

/** un informe real de la mesa: rótulo, encabezados, viñetas, numerada, tabla, líneas en blanco, sangría y una tabulación */
const INFORME = [
  '[informe de análisis · competencia · PROPUESTA: no es dato del cliente]',
  '## Hallazgos',
  '',
  '- Saturación de encebollado en la zona [ficha:11111111 · 2026-10-14]',
  '- Precio medio: 3,50 USD',
  '  - sub-punto con sangría',
  '',
  '1. Primero',
  '2. Segundo',
  '',
  '| Competidor | Precio | Reseñas |',
  '|---|---|---|',
  '| La Cevichería | 3,50 | 412 |',
  '| El Muelle | 4,00 | 87 |',
  '',
  '### Cierre',
  'Ventas 2024',
  '2025 subieron.\tCon tabulación y  doble espacio.',
].join('\n')

const montar = (c: ClienteSintetico) => {
  const t: T = { ...tablasDe(c), cerebro_dueno_preguntas: [] }
  ;(t.cerebro_fichas as unknown[]).push({ id: CITADA, client_id: c.id, ref: 'x:1', clase: 'nota', titulo: 'citada', contenido: 'c', que_es: 'c', observado_en: AHORA.toISOString(), retirada_en: null, descartada: false })
  ;(t as Record<string, unknown[]>).cerebro_pedidos = [{ id: PEDIDO, client_id: c.id, pedido: 'p', estado: 'hecho', resultado: {}, creado_en: AHORA.toISOString(), pedido_por_oficina: 'mesa', pedido_por_agente: 'a' }]
  const base = crearBaseFalsa(t as never, { reloj: () => AHORA.toISOString() })
  let n = 0
  const nuevoId = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`
  return { t, base, nuevoId }
}
const fichasDe = (t: T, clase: string) => (t.cerebro_fichas as Array<Record<string, unknown>>).filter((f) => f.clase === clase)

describe('el informe entra con su formato y sale idéntico por cada lector', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: puerta → consulta → pedido → contexto_del_cliente, sin perder un salto`, async () => {
      const { t, base, nuevoId } = montar(c)
      const r = await rutaInforme({ db: base.db as never, activo: true, ahora: AHORA, nuevoId }, {
        client_id: c.id, dry_run: false, ...WF, tipo: 'competencia', texto: INFORME, citas: [CITADA], fecha_de_corte: '2026-10-14T00:00:00Z', pedido_por: { oficina: 'mesa_de_analisis', agente: 'competitive-intelligence-agent' },
      })
      expect(r.status).toBe(200)
      const [f] = fichasDe(t, 'informe_de_analisis')
      // guardado tal cual: mismo texto, mismos saltos
      expect(f.contenido).toBe(INFORME)
      expect(String(f.contenido).split('\n').length).toBe(INFORME.split('\n').length)
      // solo la versión corta es de una línea, y se deriva del mismo texto
      expect(f.que_es).toBe(unaLinea(INFORME).slice(0, 200))
      expect(String(f.que_es)).not.toContain('\n')

      const db = base.db as never
      const q = (await rutaConsultar({ db, ahora: AHORA }, { client_id: c.id, oficina: 'mesa', agente: 'a', clase: 'informe_de_analisis', contenido_completo: true })).body as { resultados: Array<{ contenido: string }> }
      expect(q.resultados.map((x) => x.contenido)).toEqual([INFORME])

      const adj = await adjuntoDelCliente(db, c.id, AHORA)
      expect(adj.informes.map((x) => x.texto)).toEqual([INFORME])

      const p = (await rutaLeerPedido({ db, ahora: AHORA }, PEDIDO)).body as { contexto_del_cliente?: { informes: Array<{ texto: string }> } }
      expect(p.contexto_del_cliente?.informes.map((x) => x.texto)).toEqual([INFORME])
    })
  }

  it('el mismo informe reenviado es «repetido» (la huella no cambia por los saltos)', async () => {
    const c = DIEZ_CLIENTES[0]
    const { t, base, nuevoId } = montar(c)
    const cuerpo = { client_id: c.id, dry_run: false, ...WF, tipo: 'competencia', texto: INFORME, citas: [CITADA], fecha_de_corte: '2026-10-14T00:00:00Z', pedido_por: { oficina: 'mesa', agente: 'a' } }
    await rutaInforme({ db: base.db as never, activo: true, ahora: AHORA, nuevoId }, cuerpo)
    const otra = await rutaInforme({ db: base.db as never, activo: true, ahora: AHORA, nuevoId }, { ...cuerpo, texto: unaLinea(INFORME) })
    expect(otra.body.repetido).toBe(true)
    expect(fichasDe(t, 'informe_de_analisis')).toHaveLength(1)
  })
})

describe('la respuesta del dueño entra con su formato y sale idéntica', () => {
  const RESPUESTA = 'Abrimos así:\n- Lunes a viernes: 12:00 a 16:00\n- Sábado: 11:00 a 17:00\n\nDomingo cerrado.'
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre}: ficha, rastro y contexto_del_cliente guardan los saltos; la versión corta es de una línea`, async () => {
      const { t, base, nuevoId } = montar(c)
      const deps: DepsDeDueno = { db: base.db as never, interruptores: ON, ahora: AHORA, activo: true, nuevoId }
      const r = await rutaDueno(deps, { client_id: c.id, dry_run: false, ...WF, tema: 'horario de atención', pregunta: '¿Qué horario tienen?\n(por día)', respuesta: RESPUESTA, canal: 'MD de Slack', mensaje_ref: 'slack:9', respondido_en: '2026-10-15T14:00:00Z', preguntado_por: { oficina: 'comercial', agente: 'a' } })
      expect(r.status).toBe(200)
      const [f] = fichasDe(t, 'dato_del_dueno')
      expect(String(f.contenido)).toContain(`«${RESPUESTA}»`)
      expect(String(f.contenido)).toContain('«¿Qué horario tienen?\n(por día)»')
      expect((f.provenance_tag as { datos: { respuesta: string } }).datos.respuesta).toBe(RESPUESTA)
      expect(f.que_es).toBe(unaLinea(RESPUESTA))
      const adj = await adjuntoDelCliente(base.db as never, c.id, AHORA)
      expect(adj.hechos_del_dueno?.map((h) => h.respuesta)).toEqual([RESPUESTA])
      const q = (await rutaConsultar({ db: base.db as never, ahora: AHORA }, { client_id: c.id, oficina: 'o', agente: 'a', clase: 'dato_del_dueno', contenido_completo: true })).body as { resultados: Array<{ contenido: string }> }
      expect(q.resultados.map((x) => x.contenido)).toEqual([f.contenido])
    })
  }
})

describe('la cita corta del estado de la sede es de una línea; la ficha guarda el texto entero', () => {
  for (const c of DIEZ_CLIENTES.filter((x) => x.sedes.length)) {
    it(`${c.nombre}`, async () => {
      const { t, base, nuevoId } = montar(c)
      const sede = c.sedes[0]
      const texto = 'Todavía no abre.\nFalta el permiso municipal.'
      const r = await rutaDueno({ db: base.db as never, interruptores: ON, ahora: AHORA, activo: true, nuevoId }, { client_id: c.id, dry_run: false, ...WF, tema: 'apertura de la sede', pregunta: '¿Cómo está la sede?', respuesta: texto, canal: 'chat con Lenovo', mensaje_ref: 'chat:1', respondido_en: '2026-10-15T10:00:00Z', preguntado_por: { oficina: 'o', agente: 'a' }, sede_clave: sede.clave })
      expect(r.status).toBe(200)
      const fila = (t.client_sede_datos as Array<Record<string, unknown>>).find((x) => x.campo === 'estado_de_la_sede')
      expect(String(fila?.fuente_ref)).toContain('«Todavía no abre. Falta el permiso municipal.»')
      expect(String(fichasDe(t, 'dato_del_dueno')[0].contenido)).toContain(texto)
    })
  }
})

describe('privacidad sin aplanar', () => {
  it('quita correos, @usuarios y teléfonos, y deja cada salto donde estaba', () => {
    const r = sinDatosPersonales('Contacto:\n- juan.perez@mail.com\n- @juanp\n- +593 99 123 4567\n\nGasto 200 por semana')
    expect(r.redactado).toBe(true)
    expect(r.texto).toBe('Contacto:\n- [correo omitido]\n- [usuario omitido]\n- [teléfono omitido]\n\nGasto 200 por semana')
  })
  it('un teléfono no cruza de una línea a otra: dos renglones con cifras quedan como estaban', () => {
    const t = 'Ventas 2024\n2025 subieron\n12 34 56\n78 90 12'
    expect(sinDatosPersonales(t)).toEqual({ texto: t, redactado: false })
    // una columna de cifras bajo una palabra de contacto: unidas por los saltos parecían un teléfono (9 dígitos) y se borraban
    const l = 'Llamadas recibidas por día:\n120\n135\n142'
    expect(sinDatosPersonales(l)).toEqual({ texto: l, redactado: false })
  })
  it('solo recorta los bordes; espacios y tabulaciones de adentro quedan', () => {
    expect(sinDatosPersonales('  a  b\tc\r\n\r\nd  ').texto).toBe('a  b\tc\r\n\r\nd')
  })
  it('un comentario de redes conserva sus saltos; correos, @usuarios y números se quitan sin cruzar líneas', () => {
    expect(limpiarComentario('¡Me encantó!\n\nVolveré pronto 🙂')).toBe('¡Me encantó!\n\nVolveré pronto 🙂')
    expect(limpiarComentario('Escríbeme a a@b.com\nllama al +593 99 123 4567')).toBe('Escríbeme a \nllama al')
    expect(limpiarComentario('hola @ana   qué rico\n\n  sí')).toBe('hola qué rico\n\n  sí')
    expect(limpiarComentario('Año 2024\n2025 mejor')).toBe('Año 2024\n2025 mejor')
  })
})
