/**
 * 19-nov · ADENDA 1 · P2b (CC5): la mesa de piezas recibe el PERFIL DEL PÚBLICO (el mismo bloque que leen la jefatura y los pedidos de la oficina),
 * en su <documento>, con los documentos de arriba (su tope propio de 6000, con aviso, es la fila 312 del INVENTARIO). Si no se pudo leer, se dice; sin perfil, la mesa queda como antes. Sin red, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { SIN_PERFIL_LEIDO, bloqueDelPerfil } from '../../perfil-del-publico/lectores'
import { jugar, montar } from './mesa-arnes'

const PERFIL = 'Quien vive a diez minutos y decide en el momento. ' + 'x'.repeat(30_000) + ' FIN-DEL-PERFIL'

describe('ADENDA 1 · P2b · la mesa de piezas lee el perfil del público', () => {
  it('🔴 punta a punta: cada turno de la mesa trae el perfil vigente (el mismo bloque de los demás lectores), en su <documento>, antes de «## Tu turno»', async () => {
    const { M, a, id } = await montar({ fuentes: { perfil_del_publico: { estado: 'vigente', texto: PERFIL, fecha_de_corte: '2026-11-10', ficha_id: 'f-1' } } as never })
    const { turnos } = await jugar(M, id, a)
    const deLaMesa = turnos.filter((t) => t.tipo === 'dirigir' || t.tipo === 'aportar')
    expect(deLaMesa.length).toBeGreaterThan(0)
    for (const t of deLaMesa) {
      expect(t.task, t.agente).toContain('<documento fuente="el perfil del público">')
      // el bloque es el MISMO que leen la jefatura y los pedidos (bloqueDelPerfil): su tope propio de 6000 es la fila 312 del INVENTARIO (texto de terceros, CC6), aparte de P2b; aquí se ve con su aviso, nunca callado
      expect(t.task, t.agente).toContain(bloqueDelPerfil({ estado: 'vigente', texto: PERFIL, fecha_de_corte: '2026-11-10', ficha_id: 'f-1' }))
      expect(t.task, t.agente).toContain('Quien vive a diez minutos y decide en el momento.')
      expect(t.task.indexOf('Quien vive a diez minutos'), t.agente).toBeLessThan(t.task.indexOf('## Tu turno'))
    }
  })
  it('si el perfil no se pudo leer, la mesa lo dice (no lo toma como «no hay»)', async () => {
    const { M, a, id } = await montar({ fuentes: { perfil_del_publico: { estado: 'no_se_pudo_leer', detalle: 'sin conexión' } } as never })
    const { turnos } = await jugar(M, id, a)
    const t = turnos.find((x) => x.tipo === 'dirigir')!
    expect(t.task).toContain(`<documento fuente="el perfil del público">\n${SIN_PERFIL_LEIDO}\n</documento>`)
  })
  it('sin perfil, la mesa no lleva esa sección', async () => {
    const { M, a, id } = await montar()
    const { turnos } = await jugar(M, id, a)
    expect(turnos.find((x) => x.tipo === 'dirigir')!.task).not.toContain('el perfil del público')
  })
})
