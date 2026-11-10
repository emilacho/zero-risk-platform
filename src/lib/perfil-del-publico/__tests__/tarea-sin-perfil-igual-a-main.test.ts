/**
 * PERFIL DEL PÚBLICO · T2 · punto 3 de CC6: SIN perfil, las tareas de la oficina son las de main BYTE A BYTE.
 * La comparación no es contra el código nuevo (eso se compara consigo mismo): es contra una FOTO sacada con los pedidos de main (760b1fc),
 * con los contextos de `tarea-sin-perfil.contextos.ts`. 44 tareas: 9 claves de texto y 13 de láminas, con plan y sin plan.
 * (Las 3 claves de láminas `prompts`, `mirar` y `reimagen_prompts` piden artefactos previos que el contexto mínimo no trae: tampoco corren en main.)
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { construirTarea } from '../../oficina/pedidos'
import { construirTareaLaminas } from '../../oficina/pedidos-laminas'
import { contextoDeLaminas, contextoDePieza } from './tarea-sin-perfil.contextos'

const FOTO = JSON.parse(readFileSync(join(__dirname, 'tarea-sin-perfil.foto-de-main.json'), 'utf8')) as Record<string, string>

describe('🔴 sin perfil, cada tarea es la de main byte a byte (contra la foto, no contra sí misma)', () => {
  it('la foto trae las 44 tareas', () => {
    expect(Object.keys(FOTO)).toHaveLength(44)
  })
  for (const [k, esperada] of Object.entries(FOTO)) {
    const [tipo, clave, plan] = k.split('/')
    const conPlan = plan === 'con_plan'
    it(`${tipo} · ${clave} · ${plan.replace('_', ' ')}: sin el campo y con «sin perfil»`, () => {
      const hacer = (perfil?: { estado: 'sin_perfil' }) => {
        if (tipo === 'texto') { const c = contextoDePieza(conPlan); if (perfil) Object.assign(c.fuentes, { perfil_del_publico: perfil }); return construirTarea(clave, c).task }
        const c = contextoDeLaminas(conPlan); if (perfil) Object.assign(c.fuentes, { perfil_del_publico: perfil }); return construirTareaLaminas(clave, c).task
      }
      expect(hacer()).toBe(esperada)
      expect(hacer({ estado: 'sin_perfil' })).toBe(esperada)
    })
  }
})
