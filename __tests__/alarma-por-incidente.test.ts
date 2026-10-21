/** Alarma por incidente: una alarma en el canal por incidente; lo repetido y los cambios van al hilo; un aviso perdido no se calla. Puro, sin red. */
import { describe, expect, it } from 'vitest'
import { CANAL_ALERTAS, crearAlarmas, publicarEnSlack } from '../scripts/ops/alarma-por-incidente.mjs'

type Envio = { text: string; thread_ts?: string }
function slackFalso(o: { falla?: (n: number) => boolean } = {}) {
  const envios: Envio[] = []
  let n = 0
  const publicar = async (e: Envio) => { n++; if (o.falla?.(n)) return { ok: false, error: 'ratelimited' }; envios.push(e); return { ok: true, ts: `100.${envios.length}` } }
  return { envios, publicar }
}
const reloj = () => { let t = 1_000_000; return { ahora: () => t, avanza: (ms: number) => { t += ms } } }
const H = 3600 * 1000

describe('alarma por incidente', () => {
  it('la primera vez abre un mensaje en el canal; las repeticiones con otro detalle van al HILO, nunca otro mensaje de canal', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })).accion).toBe('abrio')
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('hilo')
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd3' })).accion).toBe('hilo')
    expect(s.envios.filter((e) => !e.thread_ts)).toHaveLength(1)
    expect(s.envios[0].text).toContain('T'); expect(s.envios[0].text).toContain('d1')
    expect(s.envios.slice(1).every((e) => e.thread_ts === '100.1')).toBe(true)
  })
  it('12 alarmas seguidas del mismo incidente son 1 mensaje de canal (la ráfaga de Náufrago)', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    for (let i = 0; i < 12; i++) await a.avisar({ clave: 'naufrago', titulo: 'Náufrago con actividad', detalle: 'llamadas ' + i })
    expect(s.envios.filter((e) => !e.thread_ts)).toHaveLength(1)
    expect(s.envios).toHaveLength(12)
  })
  it('el mismo detalle repetido no se vuelve a publicar y se cuenta', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })
    const r = await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })
    expect(r).toEqual({ accion: 'repetida', repeticiones: 1 }); expect(s.envios).toHaveLength(1)
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })).repeticiones).toBe(2)
  })
  it('lo que ya se dijo en el hilo tampoco se repite (d1, d2, d2 → la tercera es repetida)', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' }); await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('repetida')
    expect(s.envios).toHaveLength(2)
  })
  it('incidentes distintos son mensajes distintos', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'a', titulo: 'A', detalle: '1' }); await a.avisar({ clave: 'b', titulo: 'B', detalle: '1' })
    expect(s.envios.filter((e) => !e.thread_ts)).toHaveLength(2)
  })
  it('resolver cierra con una respuesta en el hilo; la siguiente alarma de esa clave abre un incidente nuevo', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })
    expect((await a.resolver('k', 'apagado')).accion).toBe('cerro')
    expect(s.envios[1]).toMatchObject({ thread_ts: '100.1' }); expect(s.envios[1].text).toContain('Resuelto'); expect(s.envios[1].text).toContain('apagado')
    expect((await a.resolver('k')).accion).toBe('sin_incidente')
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })).accion).toBe('abrio')
    expect(s.envios.filter((e) => !e.thread_ts)).toHaveLength(2)
  })
  it('resolver algo que no existe no publica nada', async () => {
    const s = slackFalso(); const a = crearAlarmas({ publicar: s.publicar })
    expect((await a.resolver('nada')).accion).toBe('sin_incidente'); expect(s.envios).toHaveLength(0)
  })
  it('un incidente sin actividad por 24 h se da por cerrado: la siguiente alarma abre otro', async () => {
    const s = slackFalso(); const r = reloj(); const a = crearAlarmas({ publicar: s.publicar, ahora: r.ahora })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })
    r.avanza(23 * H); expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('hilo')
    r.avanza(23 * H); expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd3' })).accion).toBe('hilo') // la actividad lo mantiene vivo
    r.avanza(25 * H); expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd4' })).accion).toBe('abrio')
  })
  it('un detalle repetido también mantiene vivo el incidente', async () => {
    const s = slackFalso(); const r = reloj(); const a = crearAlarmas({ publicar: s.publicar, ahora: r.ahora })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })
    r.avanza(23 * H); await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })
    r.avanza(23 * H); expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'igual' })).accion).toBe('repetida')
  })
  it('si Slack no confirma la apertura, el incidente NO queda abierto: el siguiente aviso vuelve a intentarlo como alarma nueva', async () => {
    const s = slackFalso({ falla: (n) => n === 1 }); const a = crearAlarmas({ publicar: s.publicar })
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })).accion).toBe('fallo')
    expect(a.estado('k')).toBeNull()
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })).accion).toBe('abrio')
  })
  it('si falla una respuesta del hilo, el detalle no se da por enviado (se reintenta en el siguiente aviso)', async () => {
    const s = slackFalso({ falla: (n) => n === 2 }); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('fallo')
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('hilo')
  })
  it('si falla el cierre, el incidente sigue abierto', async () => {
    const s = slackFalso({ falla: (n) => n === 2 }); const a = crearAlarmas({ publicar: s.publicar })
    await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd1' })
    expect((await a.resolver('k')).accion).toBe('fallo')
    expect((await a.avisar({ clave: 'k', titulo: 'T', detalle: 'd2' })).accion).toBe('hilo')
  })
  it('nunca lanza, aunque el publicador explote', async () => {
    const a = crearAlarmas({ publicar: async () => { throw new Error('boom') } })
    expect((await a.avisar({ clave: 'k', titulo: 'T' })).accion).toBe('fallo')
    expect((await a.resolver('k')).accion).toBe('sin_incidente')
  })
})

describe('publicarEnSlack (adaptador real)', () => {
  const fetchCon = (cuerpo: unknown, llamadas: Array<{ url: string; init: any }> = []) => (async (url: string, init: any) => { llamadas.push({ url, init }); return { json: async () => cuerpo } }) as never
  it('publica en #alertas con la llave del bot; con hilo manda thread_ts sin difundir al canal', async () => {
    const ll: Array<{ url: string; init: any }> = []
    const p = publicarEnSlack({ token: 'xoxb-prueba', fetchImpl: fetchCon({ ok: true, ts: '5.5' }, ll) })
    expect(await p({ text: 'hola' })).toEqual({ ok: true, ts: '5.5' })
    expect(ll[0].url).toBe('https://slack.com/api/chat.postMessage'); expect(ll[0].init.headers.Authorization).toBe('Bearer xoxb-prueba')
    expect(JSON.parse(ll[0].init.body)).toEqual({ channel: CANAL_ALERTAS, text: 'hola' })
    await p({ text: 'r', thread_ts: '5.5' })
    expect(JSON.parse(ll[1].init.body)).toEqual({ channel: CANAL_ALERTAS, text: 'r', thread_ts: '5.5', reply_broadcast: false })
  })
  it('ok:false de Slack o un fallo de red son ok:false con el motivo, sin lanzar', async () => {
    expect(await publicarEnSlack({ token: 't', fetchImpl: fetchCon({ ok: false, error: 'channel_not_found' }) })({ text: 'x' })).toEqual({ ok: false, error: 'channel_not_found' })
    expect((await publicarEnSlack({ token: 't', fetchImpl: (async () => { throw new Error('red') }) as never })({ text: 'x' })).ok).toBe(false)
  })
  it('el canal por omisión es #alertas', () => { expect(CANAL_ALERTAS).toBe('C0B7XUUEBHA') })
})
