/**
 * ESCENARIOS DE LISTA CHICA para demostrar que el paso 6 no cambió nada en lo que ya cabe (el piloto: 62 líneas).
 * Se corrieron UNA vez contra el código anterior al paso 6 (origin/main `cef390b`) y su resultado completo (lo que se le manda al modelo, lo que se
 * registra y la respuesta, sin la duración) quedó guardado en `lista-chica-antes.json`. La prueba vuelve a correrlos con el código nuevo y exige igualdad exacta.
 * Todo con modelo SIMULADO: ninguna llamada real.
 */
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Estante, Ficha } from '../../tipos'
import { razonar, type DepsDeRazonar, type PeticionAlModelo } from '../razonar'

const ESTANTES: Estante[] = ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']
const CLASES: Record<string, string[]> = {
  E1: ['plan', 'parte_de_trabajo'], E2: ['catalogo_item', 'catalogo_familia'], E3: ['sede', 'dato_de_sede'], E4: ['competidor'],
  E5: ['foto', 'logo'], E6: ['sitio'], E7: ['decision_del_aprobador'], E8: ['trozo'],
}

/** 62 líneas variadas y deterministas (estantes, clases, producto, vencidos, versiones, decisiones) */
export function listaDelPiloto(n = 62): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < n; i++) {
    const estante = ESTANTES[i % ESTANTES.length]
    const clases = CLASES[estante]
    const clase = clases[i % clases.length]
    f.push({
      ref: `prueba:${estante}-${String(i).padStart(4, '0')}`, estante, clase, titulo: `Cosa ${i} de ${clase}`,
      que_es: `descripción de la cosa ${i}: sirve para producir piezas de comunicación del cliente piloto`, origen: 'su_fuente', estado: i % 5 === 0 ? 'aprobado' : 'visto_en_su_fuente',
      fecha_fuente: `2026-09-${String(1 + (i % 28)).padStart(2, '0')}T00:00:00.000Z`, vigente_hasta: i % 9 === 0 ? '2026-09-30T00:00:00.000Z' : null, vencido: i % 9 === 0,
      peso_estimado: 200 + (i % 11) * 30, ...(clase === 'foto' ? { producto: [`producto ${i % 4}`] } : {}), ...(i % 13 === 0 ? { version: 2, vigente: true, versiones_anteriores: 1 } : {}),
    })
  }
  return f
}

export interface Escenario { nombre: string; cuerpo: Record<string, unknown>; respuesta: (p: PeticionAlModelo) => string | Error }

const base = (extra: Record<string, unknown> = {}) => ({
  cliente: A, workflow_id: 'wf-golden', workflow_execution_id: 'ex-golden', prueba: true,
  voy_a_producir: { output: 'carrusel de reels', material: 'video', canal: 'red social', objetivo: 'vender el servicio uno' },
  necesito: 'tengo que hacer un carrusel de reels', ronda: 1, ...extra,
})
const decision = (n: number[]) => JSON.stringify({ entregar: n, pixeles: [], por_que: [{ numeros: n.slice(0, 1), linea: 'sirve' }], faltantes: ['algo que no hay'], duda: n.slice(1, 2) })

export function escenariosDeListaChica(): Escenario[] {
  const piloto = listaDelPiloto(62)
  return [
    { nombre: 'piloto 62 líneas · camino feliz', cuerpo: base({ lista_de_prueba: piloto }), respuesta: () => decision([1, 2, 3, 40]) },
    { nombre: 'piloto 62 líneas · ya_trae y sin fotos', cuerpo: base({ lista_de_prueba: piloto, ya_trae: ['foto', 'sede'], pixeles: false, ronda: 2 }), respuesta: () => decision([1, 2]) },
    { nombre: 'piloto 62 líneas · el modelo falla', cuerpo: base({ lista_de_prueba: piloto }), respuesta: () => new Error('boom') },
    { nombre: 'piloto 62 líneas · respuesta rota', cuerpo: base({ lista_de_prueba: piloto }), respuesta: () => 'no es json' },
    { nombre: 'piloto 62 líneas · números inventados', cuerpo: base({ lista_de_prueba: piloto }), respuesta: () => decision([1, 2, 999]) },
    { nombre: '150 líneas · todavía cabe en una llamada', cuerpo: base({ lista_de_prueba: listaDelPiloto(150) }), respuesta: () => decision([5, 6]) },
    { nombre: 'lista de una sola línea', cuerpo: base({ lista_de_prueba: listaDelPiloto(1) }), respuesta: () => decision([1]) },
  ]
}

/** corre un escenario con el modelo simulado y devuelve todo lo observable, sin lo que cambia de una corrida a otra (la duración) */
export async function correrEscenario(e: Escenario): Promise<unknown> {
  const peticiones: PeticionAlModelo[] = []
  const registros: Array<Record<string, unknown>> = []
  const deps: DepsDeRazonar = {
    consulta: crearBaseFalsa(tablasDeLaBase()).consulta,
    llamarModelo: async (p) => {
      peticiones.push(p)
      const r = e.respuesta(p)
      if (r instanceof Error) throw r
      return { texto: r, usage: { input_tokens: 7000, output_tokens: 600 } }
    },
    registrar: async (fila) => { registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
  }
  const r = await razonar(deps, e.cuerpo)
  const sinDuracion = (o: Record<string, unknown>) => { const c = { ...o }; delete c.duration_ms; delete c.duracion_ms; return c }
  return JSON.parse(JSON.stringify({ status: r.status, cuerpo: sinDuracion(r.cuerpo), peticiones, registros: registros.map(sinDuracion) }))
}
