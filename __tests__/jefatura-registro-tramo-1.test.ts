/**
 * EL REVISOR DE REGISTRO · tramo 1 (10-nov · A′ · GO Lenovo 13:42Z · 🟢 CC7 al plan por tramos).
 * Juzgar = agente (aquí, el molde o la respuesta de la prueba); verificar lo exacto = código: frase literal, citas intocables, reemplazos que solo cambian lo señalado, sin registro no se abre.
 * Dos clientes de rubros distintos: una consultora B2B que trata de USTED y una tienda de bicicletas que VOSEA («pedís» pasa).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { almacenEnMemoria, correr, FILAS_DE_POLITICA, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { aplicarReemplazos, clasificarFichas, erroresDeLaEntradaDeRegistro, ocurrencias, tareaDeCorreccionDeRegistro, tareaDeRevisionDeRegistro, tramosCitados } from '../src/lib/jefatura/revision/registro'
import { abrirRevision } from '../src/lib/jefatura/revision/orquestador'
import { politicaDeFila } from '../src/lib/jefatura/revision'

/** la fila de la migración 202611101530 (inactiva en prod); aquí la prueba la enciende */
const FILA_REGISTRO = FILAS_DE_POLITICA.registro
const SQL = readFileSync(join(process.cwd(), 'supabase/migrations/202611101530_jefatura_politica_registro.sql'), 'utf8')

const B2B = {
  texto: '# Brief\nUsted encontrará aquí la propuesta. Contáctanos hoy y te enviamos el diagnóstico.\n\n# Citas\nEl cliente escribió: contáctanos cuando quieras.\n',
  registro: { trato: 'usted', fuente: 'manual · voz', evidencia: 'Tratamos de usted a gerentes y directores' },
  seccion_de_voz: 'Formal y cercana. Siempre de usted.',
}
const BICI = {
  texto: '# Gran idea\nPedís tu bici y la armamos en una hora. Si quieres, te la llevamos.\n> El dueño dijo: «si quieres, pasá a verla»\n',
  registro: { trato: 'vos', fuente: 'manual · voz', evidencia: 'Hablamos de vos, como en el barrio' },
  seccion_de_voz: 'Voseo rioplatense, directo.',
}

const mundo = () => {
  const mem = almacenEnMemoria({ filas: { ...FILAS_DE_POLITICA, registro: FILA_REGISTRO }, activas: ['registro'], config: { estado: 'ensayo', tipos_activos: ['registro'], clientes_ensayo: ['cliente-prueba'] } })
  return puertosDePrueba({ almacen: mem })
}
const sobreDe = (c: typeof B2B, o: { dry_run?: boolean; id?: string } = {}) => sobre('registro' as never, { id: o.id ?? 'doc-1', texto: c.texto, dry_run: o.dry_run ?? false, payload: { registro: c.registro, seccion_de_voz: c.seccion_de_voz, documento: 'el brief' } })
const fichas = (xs: Array<{ que: string; propuesta?: string }>) => JSON.stringify({ fichas: xs.map((x) => ({ que: x.que, donde: 'texto', contra_que: 'otro registro', gravedad: 'bloquea', propuesta: x.propuesta ?? `${x.que} (corregida)` })) })

describe('🔴 la fila de la política se lee', () => {
  it('la fila de la migración es válida y nace apagada', () => {
    const r = politicaDeFila(FILA_REGISTRO)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.politica.is_active).toBe(false)
  })
  it('la fila de la prueba es la de la migración (revisor, esquema, reentrega, topes, apagada)', () => {
    for (const x of ["'editor_en_jefe', false, NULL", "'reemplazos.v1'", "'siguiente_paso', 'completa'", '{"revision_fondo":0.3,"correccion":0.3}', 'ARRAY[]::text[], 0.80', '[{"donde":"*","agente":"content-creator"}]']) expect(SQL).toContain(x)
    expect(SQL).toMatch(/NACE INACTIVA', false,/)
  })
})

describe('🔴 sin registro no se abre (no hay uno por omisión)', () => {
  it('falta registro.trato → 400', async () => {
    const { P } = mundo()
    const rsp = await abrirRevision(P, sobre('registro' as never, { texto: B2B.texto, payload: {} }))
    expect(rsp.status).toBe(400)
    expect(JSON.stringify(rsp.cuerpo)).toMatch(/registro\.trato/)
  })
  it('un trato inventado no vale', () => {
    expect(erroresDeLaEntradaDeRegistro({ registro: { trato: 'vosotros' } })).toHaveLength(1)
    expect(erroresDeLaEntradaDeRegistro({ registro: { trato: 'usted' } })).toEqual([])
  })
})

describe('🔴 lo citado no se corrige', () => {
  it('bloque `>`, cita atribuida y sección «Citas» son tramos citados', () => {
    const t = 'a\n> pasá nomás\nEl dueño dice: «vení el lunes»\n# Citas\nte esperamos\n# Otra\nfuera'
    const tr = tramosCitados(t)
    const en = (f: string) => tr.some(([a, b]) => t.indexOf(f) >= a && t.indexOf(f) + f.length <= b)
    for (const f of ['pasá nomás', 'vení el lunes', 'te esperamos']) expect(en(f)).toBe(true)
    expect(en('fuera')).toBe(false)
  })
  it('palabra entera: «pedís» no aparece dentro de «despedís»', () => {
    expect(ocurrencias('nos despedís y pedís', 'pedís').fuera).toHaveLength(1)
  })
  it('una frase solo en citas es aviso; una no literal se descarta', () => {
    const c = clasificarFichas(B2B.texto, [{ que: 'contáctanos cuando quieras', donde: 'Citas', contra_que: '', gravedad: 'bloquea', propuesta: '' }, { que: 'escríbenos ya', donde: 'texto', contra_que: '', gravedad: 'bloquea', propuesta: '' }, { que: 'te enviamos', donde: 'texto', contra_que: '', gravedad: 'sugerencia', propuesta: '' }])
    expect(c.en_citas).toEqual(['contáctanos cuando quieras'])
    expect(c.no_literales).toEqual(['escríbenos ya'])
    expect(c.corregibles.map((f) => [f.que, f.gravedad])).toEqual([['te enviamos', 'bloquea']])
  })
  it('🔴 sabotaje: el reemplazo NO toca la frase dentro de la cita', () => {
    const t = 'Y si quieres, te la llevamos.\n> El dueño dijo: «si quieres, pasá a verla»\n'
    const r = aplicarReemplazos(t, [{ id: 'f1', antes: 'si quieres', despues: 'si querés' }], new Map([['f1', 'si quieres']]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.texto).toBe('Y si querés, te la llevamos.\n> El dueño dijo: «si quieres, pasá a verla»\n')
    // solo dentro de la cita → no hay nada que reemplazar
    expect(aplicarReemplazos(BICI.texto, [{ id: 'f1', antes: 'si quieres', despues: 'si querés' }], new Map([['f1', 'si quieres']])).ok).toBe(false)
  })
})

describe('🔴 los reemplazos solo cambian lo señalado', () => {
  const tomadas = new Map([['f1', 'te enviamos']])
  it('cambia esa frase y nada más', () => {
    const r = aplicarReemplazos(B2B.texto, [{ id: 'f1', antes: 'te enviamos', despues: 'le enviamos' }], tomadas)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.texto).toBe(B2B.texto.replace('te enviamos', 'le enviamos'))
  })
  it('«antes» distinto de la frase, un id ajeno o «despues» igual: error', () => {
    expect(aplicarReemplazos(B2B.texto, [{ id: 'f1', antes: 'te envío', despues: 'le envío' }], tomadas).ok).toBe(false)
    expect(aplicarReemplazos(B2B.texto, [{ id: 'f9', antes: 'te enviamos', despues: 'le enviamos' }], tomadas).ok).toBe(false)
    expect(aplicarReemplazos(B2B.texto, [{ id: 'f1', antes: 'te enviamos', despues: 'te enviamos' }], tomadas).ok).toBe(false)
  })
})

describe('🔴 los pedidos llevan el registro del sobre y la voz del manual', () => {
  it('el revisor recibe el trato del cliente, la voz y el documento entero', () => {
    const t = tareaDeRevisionDeRegistro({ payload: { registro: BICI.registro, seccion_de_voz: BICI.seccion_de_voz } as never, texto: BICI.texto }).task
    for (const x of ['voseo (vos)', 'Hablamos de vos, como en el barrio', 'Voseo rioplatense, directo.', 'Pedís tu bici']) expect(t).toContain(x)
  })
  it('el creador recibe sus fichas y el formato de reemplazos', () => {
    const t = tareaDeCorreccionDeRegistro({ payload: { registro: B2B.registro } as never, texto: B2B.texto, fichas: [{ id: 'f1', que: 'te enviamos', donde: 'texto' }] })
    expect(t.esquema).toBe('reemplazos.v1')
    expect(t.task).toContain('[f1] en texto: «te enviamos»')
    expect(t.task).toContain('usted')
  })
})

describe('🔴 la corrida entera (dos clientes)', () => {
  it('B2B usted: el revisor señala; el creador reemplaza; la versión nueva solo cambia esas frases; la cita queda como aviso', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(B2B), ({ paso, pedido }) => {
      if (paso === 'revision_registro') return { texto: fichas([{ que: 'Contáctanos hoy' }, { que: 'te enviamos' }, { que: 'contáctanos cuando quieras' }, { que: 'llámanos' }]), costo_usd: 0.02 }
      const ids = [...String(pedido.task ?? '').matchAll(/\[([^\]]+)\] en/g)].map((m) => m[1])
      const frases = [...String(pedido.task ?? '').matchAll(/\] en [^:]+: «([^»]+)»/g)].map((m) => m[1])
      const despues: Record<string, string> = { 'Contáctanos hoy': 'Contáctenos hoy', 'te enviamos': 'le enviamos' }
      return { texto: JSON.stringify({ respuestas: ids.map((id) => ({ id, estado: 'tomada', razon: 'es otro registro' })), reemplazos: ids.map((id, i) => ({ id, antes: frases[i], despues: despues[frases[i]] })) }), costo_usd: 0.03 }
    })
    expect(d.turnos.map((t) => t.paso)).toEqual(['revision_registro', 'correccion:content-creator'])
    const s = d.final.cuerpo.salida as { artefacto_final: { texto: string }; avisos?: string[] }
    expect(s.artefacto_final.texto).toBe(B2B.texto.replace('Contáctanos hoy', 'Contáctenos hoy').replace('te enviamos', 'le enviamos'))
    expect(s.avisos?.some((a) => a.includes('contáctanos cuando quieras') && a.includes('otro registro'))).toBe(true)
  })

  it('tienda que vosea: «Pedís» pasa (el revisor no la señala) y solo «Si quieres» se corrige; la cita del dueño no se toca', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(BICI, { id: 'doc-bici' }), ({ paso, pedido }) => {
      if (paso === 'revision_registro') return { texto: fichas([{ que: 'Si quieres', propuesta: 'Si querés' }]) }
      const id = String(pedido.task ?? '').match(/\[([^\]]+)\] en/)![1]
      return { texto: JSON.stringify({ respuestas: [{ id, estado: 'tomada', razon: 'tuteo' }], reemplazos: [{ id, antes: 'Si quieres', despues: 'Si querés' }] }) }
    })
    const s = d.final.cuerpo.salida as { artefacto_final: { texto: string } }
    expect(s.artefacto_final.texto).toContain('Pedís tu bici')
    expect(s.artefacto_final.texto).toContain('Si querés, te la llevamos')
    expect(s.artefacto_final.texto).toContain('«si quieres, pasá a verla»')
  })

  it('🔴 sabotaje de registro fijo: con el mismo texto, el sobre usted y el sobre vos llevan tratos distintos al revisor', async () => {
    const pedidos: string[] = []
    for (const c of [B2B, { ...B2B, registro: BICI.registro }]) {
      const { P } = mundo()
      await correr(P, sobreDe(c as typeof B2B, { id: `doc-${c.registro.trato}` }), ({ paso, pedido }) => { if (paso === 'revision_registro') pedidos.push(String(pedido.task)); return { texto: '{"fichas":[]}' } })
    }
    expect(pedidos[0]).toContain('usted')
    expect(pedidos[0]).not.toContain('voseo (vos)')
    expect(pedidos[1]).toContain('voseo (vos)')
  })

  it('sin fichas corregibles no hay corrección y el texto sale igual', async () => {
    const { P } = mundo()
    const d = await correr(P, sobreDe(B2B, { id: 'doc-limpio' }), ({ paso }) => (paso === 'revision_registro' ? { texto: fichas([{ que: 'no está en el texto' }]) } : undefined))
    expect(d.turnos.map((t) => t.paso)).toEqual(['revision_registro'])
    expect((d.final.cuerpo.salida as { artefacto_final: { texto: string } }).artefacto_final.texto).toBe(B2B.texto)
  })

  it('reemplazo equivocado → se le pide reintento; tomó y no dio reemplazo → reintento', async () => {
    const { P } = mundo()
    let correcciones = 0
    const d = await correr(P, sobreDe(B2B, { id: 'doc-reintento' }), ({ paso, pedido }) => {
      if (paso === 'revision_registro') return { texto: fichas([{ que: 'te enviamos' }]) }
      const id = String(pedido.task ?? '').match(/\[([^\]]+)\] en/)![1]
      correcciones++
      if (correcciones === 1) return { texto: JSON.stringify({ respuestas: [{ id, estado: 'tomada', razon: 'x' }], reemplazos: [] }) }
      return { texto: JSON.stringify({ respuestas: [{ id, estado: 'tomada', razon: 'x' }], reemplazos: [{ id, antes: 'te enviamos', despues: 'le enviamos' }] }) }
    })
    expect(correcciones).toBe(2)
    expect((d.final.cuerpo.salida as { artefacto_final: { texto: string } }).artefacto_final.texto).toContain('le enviamos')
  })

  it('«antes» que no es la frase de la ficha → reintento con el error; nunca se guarda un texto a medias', async () => {
    const { P } = mundo()
    const pedidos: string[] = []
    const d = await correr(P, sobreDe(B2B, { id: 'doc-antes-malo' }), ({ paso, pedido }) => {
      if (paso === 'revision_registro') return { texto: fichas([{ que: 'te enviamos' }]) }
      pedidos.push(String(pedido.task ?? ''))
      const id = String(pedido.task ?? '').match(/\[([^\]]+)\] en/)![1]
      const antes = pedidos.length === 1 ? 'te envío' : 'te enviamos'
      return { texto: JSON.stringify({ respuestas: [{ id, estado: 'tomada', razon: 'x' }], reemplazos: [{ id, antes, despues: 'le enviamos' }] }) }
    })
    expect(pedidos).toHaveLength(2)
    expect(pedidos[1]).toMatch(/EXACTAMENTE la frase de la ficha/)
    const s = d.final.cuerpo.salida as { artefacto_final: { texto: string }; versiones: unknown[] }
    expect(s.artefacto_final.texto).toBe(B2B.texto.replace('te enviamos', 'le enviamos'))
  })

  it('el seco (dry_run) corre con moldes: ficha literal y su reemplazo', async () => {
    const { P } = mundo()
    const d = await correr(P, { ...sobreDe(B2B, { id: 'doc-seco', dry_run: true }), payload: { ...(sobreDe(B2B).payload as object), dry_run: true, simulacion: { fichas: 'bloquea' } } })
    expect(d.turnos.map((t) => t.paso)).toEqual(['revision_registro', 'correccion:content-creator'])
    expect((d.final.cuerpo.salida as { artefacto_final: { texto: string } }).artefacto_final.texto).toContain('Brief-simulado')
  })
})
