/**
 * LAS SEDES DE UN CLIENTE · lógica pura · pruebas a costo cero con los datos REALES de Náufrago (sitio · Instagram · Mapas) · CC#1 · 2026-10-02
 * (encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1, 2, 3 y 6 · firma de Emilio: «el horario lo ve el sistema, no el dueño»).
 *
 * Se demuestra:
 *   ① leer un horario sin adivinar (texto libre · schema.org · Mapas) y compararlo (jueves a lunes cruza el domingo)
 *   ② cada fuente produce observaciones CON su fuente y su fecha: el sitio (datos estructurados) · la bio de Instagram («📍Olon 🕓Jueves-Lunes 08:00-16:00») · Mapas
 *   ③ 🔴 Mapas NUNCA crea una sede y el homónimo de Gualaceo se DESCARTA con su motivo (el caso real que entró al cerebro)
 *   ④ la ficha resuelta: coincide · una fuente · CONFLICTO · sin dato · lo que choca o falta queda DECLARADO, nunca se rellena
 *   ⑤ Mapas con ciudad y dirección de la sede, no con el país · sin ubicación no se ofrece
 *   ⑥ la voz: los textos propios de los posts, sin la cola de hashtags
 * Caso de prueba: Náufrago (Guayaquil y Olón).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const S = require(join(process.cwd(), 'src', 'lib', 'sedes', 'sedes-logica.js'))
const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const IG = JSON.parse(readFileSync(join(FX, 'instagram-perfil.json'), 'utf8'))
const MAPAS = JSON.parse(readFileSync(join(FX, 'mapas-homonimo-gualaceo.json'), 'utf8'))

const obsSitio = () => S.observacionesDelSitio(SITIO.content_text, { url: SITIO.url, crawled_at: SITIO.crawled_at })
const obsIg = () => S.observacionesDeInstagram(IG, { observado_en: '2026-10-01T23:45:36Z' })
const TODAS = () => [...obsSitio(), ...obsIg()]

describe('① leer un horario SIN ADIVINAR', () => {
  const d = (t: string) => S.describirHorario(S.horarioDeTexto(t))
  it('texto libre en español: rangos de días (también los que cruzan el domingo) y de horas', () => {
    expect(d('Jueves-Lunes 08:00-16:00')).toBe('jueves a lunes 08:00–16:00')
    expect(d('Atendemos jueves a lunes de 7:00 a 15:00')).toBe('jueves a lunes 07:00–15:00')
    expect(d('Lun-Vie 9 a 18')).toBe('lunes a viernes 09:00–18:00')
    expect(d('de lunes a sábado, 7am a 3pm')).toBe('lunes a sábado 07:00–15:00')
    expect(d('martes y jueves 10 AM to 6 PM')).toBe('martes y jueves 10:00–18:00')
    expect(d('todos los días 8:30-17:30')).toBe('todos los días 08:30–17:30')
  })
  it('lo que NO se puede leer sin adivinar devuelve null (sin días, sin horas, o «mar» que es el mar)', () => {
    expect(S.horarioDeTexto('abierto de 7am a 3pm')).toBeNull() // sin días: no se inventa «todos»
    expect(S.horarioDeTexto('jueves a lunes')).toBeNull() // sin horas
    expect(S.horarioDeTexto('el mar nos espera de 8 a 16')).toBeNull() // «mar» suelto no es martes
    expect(S.horarioDeTexto('pedidos hasta las 2 de 3 platos')).toBeNull()
  })
  it('schema.org y Mapas llegan al MISMO objeto que el texto libre ⇒ se pueden comparar', () => {
    const ld = S.horarioDeJsonLd([{ dayOfWeek: ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'], opens: '07:00', closes: '15:00' }])
    expect(S.canonicoHorario(ld)).toBe(S.canonicoHorario(S.horarioDeTexto('jueves a lunes de 7am a 3pm')))
    const mp = S.horarioDeMaps([{ day: 'jueves', hours: '7 AM to 3 PM' }, { day: 'viernes', hours: '7 AM to 3 PM' }, { day: 'sábado', hours: '7 AM to 3 PM' }, { day: 'domingo', hours: '7 AM to 3 PM' }, { day: 'lunes', hours: '7 AM to 3 PM' }, { day: 'martes', hours: 'Cerrado' }, { day: 'miércoles', hours: 'Cerrado' }])
    expect(S.canonicoHorario(mp)).toBe(S.canonicoHorario(ld))
    expect(S.describirHorario(ld)).toBe('jueves a lunes 07:00–15:00')
  })
  it('horarios distintos NO son iguales (el de la bio 08:00–16:00 ≠ el del sitio 07:00–15:00)', () => {
    expect(S.canonicoHorario(S.horarioDeTexto('Jueves-Lunes 08:00-16:00'))).not.toBe(S.canonicoHorario(S.horarioDeTexto('Jueves-Lunes 07:00-15:00')))
  })
})

describe('② cada fuente real produce observaciones CON su fuente y su fecha', () => {
  it('el sitio (datos estructurados): Guayaquil · Avenida 8 NO · jueves a lunes 07:00–15:00 · teléfono · sin repetir por página', () => {
    const o = obsSitio()
    const g = o.filter((x: { sede: string }) => x.sede === 'guayaquil')
    expect(g.map((x: { campo: string }) => x.campo).sort()).toEqual(['canal_pedido', 'ciudad', 'direccion', 'horario']) // 1 por campo aunque la página lo repita 8 veces
    expect(g.find((x: { campo: string }) => x.campo === 'horario').valor_texto).toBe('jueves a lunes 07:00–15:00')
    expect(g.find((x: { campo: string }) => x.campo === 'direccion').valor_texto).toBe('Avenida 8 NO, Guayaquil')
    for (const x of g) { expect(x.fuente).toBe('sitio'); expect(x.fuente_ref).toBe('https://www.naufrago.ec'); expect(x.observado_en).toBeTruthy() }
  })
  it('Instagram: «📍Olon 🕓Jueves-Lunes 08:00-16:00» ata ese horario a Olón · «Pedidos☎️0997744288» es de la CUENTA (no dice sede)', () => {
    const o = obsIg()
    const h = o.find((x: { campo: string }) => x.campo === 'horario')
    expect(h).toMatchObject({ sede: 'olon', ciudad: 'Olon', fuente: 'instagram', alcance: 'sede', observado_en: '2026-10-01T23:45:36Z' })
    expect(S.describirHorario(h.valor_norm)).toBe('jueves a lunes 08:00–16:00')
    const t = o.find((x: { campo: string }) => x.campo === 'canal_pedido')
    expect(t).toMatchObject({ sede: null, alcance: 'cuenta', valor_norm: '997744288' })
  })
  it('el teléfono de la bio (0997744288) y el del sitio (+593997744288) son el MISMO número', () => {
    expect(S.telefonoNorm('0997744288')).toBe(S.telefonoNorm('+593997744288'))
    expect(S.telefonoNorm('12345')).toBeNull()
  })
  it('un sitio sin datos estructurados o con JSON roto no tumba nada: 0 observaciones', () => {
    expect(S.observacionesDelSitio('hola {"@context":"https://schema.org","x":', {})).toEqual([])
    expect(S.observacionesDelSitio('', {})).toEqual([])
    expect(S.observacionesDeInstagram({ biography: 'Ceviche rico 🌊' }, {})).toEqual([])
    expect(S.observacionesDeInstagram(null, {})).toEqual([])
  })
})

describe('③ 🔴 Mapas NUNCA crea una sede · el homónimo de Gualaceo se DESCARTA con su motivo', () => {
  const sedes = () => S.descubrirSedes(TODAS())
  it('las sedes salen del sitio y de Instagram (Guayaquil y Olón) · la de Olón se llama «Olon» sin tilde en la bio y el nombre se conserva como se vio', () => {
    expect(sedes().map((s: { clave: string }) => s.clave).sort()).toEqual(['guayaquil', 'olon'])
  })
  it('el nombre CON tilde gana al escrito sin ella (si alguna fuente la trae)', () => {
    const extra = [{ sede: 'olon', ciudad: 'Olón', campo: 'direccion', valor_texto: 'x', valor_norm: 'x', fuente: 'sitio', alcance: 'sede' }]
    expect(S.descubrirSedes([...TODAS(), ...extra]).find((s: { clave: string }) => s.clave === 'olon').ciudad).toBe('Olón')
  })
  it('🔴 la ficha de Gualaceo («El Naufrago Marisquería») NO es una sede de Náufrago ⇒ descartada, con su motivo y SIN observaciones', () => {
    const r = S.observacionesDeMaps(MAPAS.item, sedes(), 'Náufrago', { observado_en: MAPAS.created_at })
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/Gualaceo/)
    expect(r.descartado.motivo).toMatch(/no es una sede de este cliente/)
    expect(r.descartado.motivo).toMatch(/Guayaquil/)
  })
  it('sin ninguna sede conocida, Mapas tampoco crea una: se descarta (nunca «la primera ficha que salga»)', () => {
    const r = S.observacionesDeMaps(MAPAS.item, [], 'Náufrago', {})
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/ninguna/)
  })
  it('una ficha de OTRO negocio en una ciudad que SÍ es sede se descarta por el nombre', () => {
    const r = S.observacionesDeMaps({ ...MAPAS.item, title: 'Pizzería Don Luigi', city: 'Guayaquil' }, sedes(), 'Náufrago', {})
    expect(r.observaciones).toEqual([])
    expect(r.descartado.motivo).toMatch(/no es el del cliente/)
  })
  it('CONTROL POSITIVO: la ficha del propio negocio en una sede conocida SÍ observa (horario · dirección · teléfono) con su fuente', () => {
    const propia = { title: 'Náufrago', city: 'Guayaquil', street: 'Avenida 8 NO', address: 'Avenida 8 NO, Guayaquil', phone: '+593 99 774 4288', url: 'https://maps/x', openingHours: [{ day: 'jueves', hours: '7 AM to 3 PM' }, { day: 'viernes', hours: '7 AM to 3 PM' }, { day: 'sábado', hours: '7 AM to 3 PM' }, { day: 'domingo', hours: '7 AM to 3 PM' }, { day: 'lunes', hours: '7 AM to 3 PM' }, { day: 'martes', hours: 'Cerrado' }, { day: 'miércoles', hours: 'Cerrado' }] }
    const r = S.observacionesDeMaps(propia, sedes(), 'Náufrago', { observado_en: '2026-10-02' })
    expect(r.descartado).toBeNull()
    expect(r.observaciones.map((x: { campo: string }) => x.campo).sort()).toEqual(['canal_pedido', 'direccion', 'horario'])
    expect(r.observaciones.every((x: { fuente: string; sede: string }) => x.fuente === 'mapas' && x.sede === 'guayaquil')).toBe(true)
  })
})

describe('④ la ficha resuelta: lo que choca o falta queda DECLARADO', () => {
  const resueltas = () => S.resolverSedes(S.descubrirSedes(TODAS()), TODAS())
  const de = (c: string) => resueltas().find((s: { clave: string }) => s.clave === c)
  it('Náufrago HOY: Guayaquil trae horario del sitio · Olón trae el de Instagram · y NO se confunden entre sí (el «conflicto» de la primera corrida era dos sedes distintas)', () => {
    expect(de('guayaquil').horario).toMatchObject({ estado: 'una_fuente', valor: 'jueves a lunes 07:00–15:00' })
    expect(de('guayaquil').horario.fuentes[0].fuente).toBe('sitio')
    expect(de('olon').horario).toMatchObject({ estado: 'una_fuente', valor: expect.stringContaining('jueves a lunes 08:00–16:00') })
    expect(de('olon').horario.fuentes[0].fuente).toBe('instagram')
  })
  it('lo que ninguna fuente trae queda «sin_dato» (la dirección de Olón) · NO se rellena', () => {
    expect(de('olon').direccion).toEqual({ estado: 'sin_dato', valor: null, fuentes: [] })
    expect(de('guayaquil').direccion).toMatchObject({ estado: 'una_fuente', valor: 'Avenida 8 NO, Guayaquil' })
  })
  it('el teléfono de la CUENTA coincide con el del sitio: dos fuentes distintas ⇒ «coincide»', () => {
    expect(de('guayaquil').canal_pedido.estado).toBe('coincide')
  })
  it('🔴 CONFLICTO: dos fuentes dicen horarios distintos para la MISMA sede ⇒ no se usa ninguno · se declaran las dos versiones', () => {
    const sede = [{ clave: 'olon', ciudad: 'Olón' }]
    const obs = [
      { sede: 'olon', ciudad: 'Olón', campo: 'horario', valor_texto: 'jueves a lunes 07:00–15:00', valor_norm: S.horarioDeTexto('jueves a lunes 7:00 a 15:00'), fuente: 'sitio', observado_en: '2026-09-29', alcance: 'sede' },
      { sede: 'olon', ciudad: 'Olón', campo: 'horario', valor_texto: 'jueves a lunes 08:00–16:00', valor_norm: S.horarioDeTexto('Jueves-Lunes 08:00-16:00'), fuente: 'instagram', observado_en: '2026-10-01', alcance: 'sede' },
    ]
    const h = S.resolverSedes(sede, obs)[0].horario
    expect(h.estado).toBe('conflicto')
    expect(h.valor).toBeNull()
    expect(h.versiones.map((v: { valor: string }) => v.valor)).toEqual(['jueves a lunes 07:00–15:00', 'jueves a lunes 08:00–16:00'])
    expect(S.bloqueDeSedes(S.resolverSedes(sede, obs))).toMatch(/LAS FUENTES NO COINCIDEN/)
  })
  it('dos fuentes que dicen LO MISMO (un horario por texto y otro por datos estructurados) ⇒ «coincide»', () => {
    const sede = [{ clave: 'g', ciudad: 'Guayaquil' }]
    const obs = [
      { sede: 'g', campo: 'horario', valor_texto: 'a', valor_norm: S.horarioDeTexto('jueves a lunes 7am a 3pm'), fuente: 'instagram', alcance: 'sede' },
      { sede: 'g', campo: 'horario', valor_texto: 'a', valor_norm: S.horarioDeJsonLd([{ dayOfWeek: ['Thursday', 'Friday', 'Saturday', 'Sunday', 'Monday'], opens: '07:00', closes: '15:00' }]), fuente: 'sitio', alcance: 'sede' },
    ]
    expect(S.resolverSedes(sede, obs)[0].horario.estado).toBe('coincide')
  })
  it('un horario de la CUENTA (sin sede) que choca con el de una sede se declara como conflicto: no se adivina a cuál sede era', () => {
    const sede = [{ clave: 'g', ciudad: 'Guayaquil' }]
    const obs = [
      { sede: 'g', campo: 'horario', valor_texto: 'jueves a lunes 07:00–15:00', valor_norm: S.horarioDeTexto('jueves a lunes 7am a 3pm'), fuente: 'sitio', alcance: 'sede' },
      { sede: null, campo: 'horario', valor_texto: 'jueves a lunes 08:00–16:00', valor_norm: S.horarioDeTexto('jueves a lunes 8 a 16'), fuente: 'instagram', alcance: 'cuenta' },
    ]
    expect(S.resolverSedes(sede, obs)[0].horario.estado).toBe('conflicto')
  })
  it('un texto que no se pudo leer como horario se declara «sin_interpretar» con el texto (no se descarta en silencio)', () => {
    const r = S.resolverCampo('horario', [{ sede: 'g', campo: 'horario', valor_texto: 'abrimos cuando hay marea', valor_norm: null, fuente: 'instagram' }])
    expect(r.estado).toBe('sin_interpretar')
    expect(r.fuentes[0].valor).toBe('abrimos cuando hay marea')
  })
  it('direcciones: una que contiene a la otra es la misma (sin conflicto falso por «Av. 8 NO» vs «Avenida 8 NO, Guayaquil»)', () => {
    const r = S.resolverCampo('direccion', [
      { valor_texto: 'Avenida 8 NO', valor_norm: 'avenida-8-no', fuente: 'sitio' },
      { valor_texto: 'Avenida 8 NO, Guayaquil', valor_norm: 'avenida-8-no-guayaquil', fuente: 'mapas' },
    ])
    expect(r.estado).toBe('coincide')
    expect(S.resolverCampo('direccion', [{ valor_texto: 'a', valor_norm: 'calle-1', fuente: 'sitio' }, { valor_texto: 'b', valor_norm: 'calle-9', fuente: 'mapas' }]).estado).toBe('conflicto')
  })
  it('el bloque del pedido declara lo que falta y NUNCA le pide el dato al dueño', () => {
    const b = S.bloqueDeSedes(resueltas())
    expect(b).toContain('Sede Guayaquil')
    expect(b).toContain('Sede Olon')
    expect(b).toMatch(/SIN DATO/)
    expect(b).toMatch(/sitio/)
    expect(b).toMatch(/instagram/)
    expect(b).toMatch(/Nunca le preguntes el horario al dueño/)
    expect(b).not.toMatch(/pregunta al dueño|confirma con el dueño/i)
  })
  it('sin sedes registradas, o con la lectura caída, el bloque lo DECLARA y no afirma nada', () => {
    expect(S.bloqueDeSedes([])).toMatch(/NO tiene sedes registradas/)
    expect(S.bloqueDeSedes(null, { error: 'timeout' })).toMatch(/NO se pudieron leer las sedes.*timeout/)
  })
})

describe('⑤ Mapas se pide con la CIUDAD y la DIRECCIÓN de la sede, no con el país', () => {
  const resueltas = () => S.resolverSedes(S.descubrirSedes(TODAS()), TODAS())
  it('Náufrago: una búsqueda por sede ⇒ «Avenida 8 NO, Guayaquil» y «Olon» (nunca «Ecuador»)', () => {
    const u = S.ubicacionesParaMapas(resueltas(), { country: 'Ecuador', market: 'Guayaquil · Guayas' })
    expect(u).toEqual([{ ciudad: 'Guayaquil', donde: 'Avenida 8 NO, Guayaquil' }, { ciudad: 'Olon', donde: 'Olon' }])
    expect(JSON.stringify(u)).not.toMatch(/Ecuador/)
  })
  it('sin sedes: la ciudad de la ficha (market «Guayaquil · Guayas» ⇒ Guayaquil) · el país solo NO es una ubicación', () => {
    expect(S.ubicacionesParaMapas([], { country: 'Ecuador', market: 'Guayaquil · Guayas' })).toEqual([{ ciudad: 'Guayaquil', donde: 'Guayaquil' }])
    expect(S.ubicacionesParaMapas([], { country: 'Ecuador', market: 'Ecuador' })).toEqual([])
    expect(S.ubicacionesParaMapas([], { country: 'Ecuador' })).toEqual([])
    expect(S.ubicacionesParaMapas([], {})).toEqual([])
    expect(S.ubicacionesParaMapas([], { city: 'Cuenca' })).toEqual([{ ciudad: 'Cuenca', donde: 'Cuenca' }])
  })
})

describe('⑥ la voz: los textos de los posts propios', () => {
  it('Náufrago: los más recientes primero · hasta 8 · sin la cola de hashtags · recortados · sin repetir', () => {
    const t = S.textosPropios(IG.latestPosts, { max: 8 })
    expect(t.length).toBeGreaterThan(3)
    expect(t.length).toBeLessThanOrEqual(8)
    const fechas = t.map((x: { fecha: string }) => x.fecha)
    expect([...fechas].sort().reverse()).toEqual(fechas)
    for (const x of t) { expect(x.texto.length).toBeLessThanOrEqual(321); expect(x.texto).not.toMatch(/(#\S+\s*){3,}$/) }
    const yuca = t.find((x: { texto: string }) => /yuca/.test(x.texto))
    expect(yuca.texto).not.toMatch(/#syntropic/)
    expect(new Set(t.map((x: { texto: string }) => x.texto)).size).toBe(t.length)
  })
  it('sin textos propios el bloque lo DECLARA (no inventa una voz) · con textos manda tutear', () => {
    expect(S.bloqueDeVoz([])).toMatch(/No hay textos de posts propios/)
    expect(S.bloqueDeVoz(null)).toMatch(/sin textos propios de referencia/)
    const b = S.bloqueDeVoz(S.textosPropios(IG.latestPosts))
    expect(b).toMatch(/TUTEA/)
    expect(b).toMatch(/no los copies/i)
    expect(b).toMatch(/\[2026-/)
  })
  it('entradas basura (sin caption, muy cortas, no lista) no rompen nada', () => {
    expect(S.textosPropios(undefined)).toEqual([])
    expect(S.textosPropios([{ caption: 'hola' }, { caption: null }, null, {}])).toEqual([])
  })
})
