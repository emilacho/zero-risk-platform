/**
 * LA ENTRADA DEL CLIENTE (CC#1 · 20-oct · encargo de Lenovo «limpiar y arreglar» · parte 2). US$ 0.
 * Prueba real del 20-oct: el trato traía SOLO su Instagram como «web»; el alta lo leyó como sitio, volvió el muro de login («create an account or log in to instagram…») y se le dijo al descubridor
 * «es la fuente»; además el manual habló de OTRA cuenta (@zerorisk_ec) aunque el trato dio @zeroriskgye. Aquí se EJECUTA el texto real de cada nodo y se compara contra el flujo vivo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const D = path.resolve(__dirname, '../scripts/worker-staging/LyVoKcrypS5uLyuu')
const M = await import(pathToFileURL(path.join(D, 'construir-entrada-del-cliente-2026-10-20.mjs')).href)
type Nodo = { name: string; type: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, { main: Array<Array<{ node: string }>> }> }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const antes = leer('LyVoKcrypS5uLyuu-ANTES-entrada-del-cliente-2026-10-20.json')
const nuevo = leer('LyVoKcrypS5uLyuu-ARREGLADO-entrada-del-cliente-2026-10-20.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!

const bloque = new Function(M.BLOQUE + '\nreturn { entNormalizar, entEsMuro, entClasificar, entUsuarioDe }')() as {
  entNormalizar: (b: Record<string, unknown>) => { sitio: string | null; cuentas: Record<string, string>; origen: Record<string, string>; direccion_era: string | null; avisos: string[] }
  entEsMuro: (t: string, u?: string) => { es: boolean; tipo: string | null; motivo: string; senales: string[] }
  entClasificar: (u: string) => { tipo: string; red: string | null; usuario: string | null }
  entUsuarioDe: (red: string, v: string) => string | null
}

// ───────────────────────── ejecutar el texto de un nodo
function correr(codigo: string, o: { entrada?: Record<string, unknown>; nodos?: Record<string, Record<string, unknown>> }) {
  const $ = (n: string) => { const v = (o.nodos ?? {})[n]; if (v === undefined) throw new Error('nodo no ejecutado: ' + n); return { first: () => ({ json: v }), all: () => [{ json: v }], item: { json: v } } }
  return new Function('$input', '$', '$env', '$workflow', '$execution', codigo)({ first: () => ({ json: o.entrada ?? {} }), all: () => [{ json: o.entrada ?? {} }] }, $, {}, { id: 'WF' }, { id: 'EX' }) as Array<{ json: Record<string, any>; pairedItem?: unknown }>
}
const MURO_IG = 'Instagram\nSee everyday moments from your close friends.\nLog into Instagram\nMobile number, username or email\nPassword\nLog in\nForgot password?\nLog in with Facebook\nCreate new account'

describe('el bloque: qué es una dirección y qué es una pared', () => {
  it('Instagram como «web» NO es sitio: se guarda como cuenta propia y se DICE', () => {
    const r = bloque.entNormalizar({ website: 'https://www.instagram.com/zeroriskgye' })
    expect(r).toMatchObject({ sitio: null, cuentas: { instagram: 'zeroriskgye' }, origen: { instagram: 'sacada_de_la_direccion' }, direccion_era: 'instagram' })
    expect(r.avisos.join(' ')).toMatch(/cuenta de instagram, no un sitio web/)
  })
  it('la cuenta DADA manda: una cuenta que venía dentro de la «web» no la pisa', () => {
    const r = bloque.entNormalizar({ website: 'https://www.instagram.com/otra_cuenta/', instagram: '@zeroriskgye' })
    expect(r.cuentas.instagram).toBe('zeroriskgye')
    expect(r.origen.instagram).toBe('dada')
    expect(bloque.entNormalizar({ website: 'https://zerorisk.ec', instagram_handle: 'https://instagram.com/zeroriskgye/' })).toMatchObject({ sitio: 'https://zerorisk.ec', cuentas: { instagram: 'zeroriskgye' } })
  })
  it('un sitio de verdad sigue siendo sitio (con o sin «https»), también si trae red aparte', () => {
    for (const w of ['https://tienda.com', 'tienda.com', 'http://www.empresa.com.ec/inicio', 'https://empresa.ec/?utm=x']) expect(bloque.entNormalizar({ website: w }).sitio, w).toBe(w)
    expect(bloque.entNormalizar({ domain: 'empresa.ec' }).sitio).toBe('empresa.ec') // el campo `domain` sigue valiendo
    expect(bloque.entNormalizar({}).sitio).toBeNull()
  })
  it('Facebook, TikTok, LinkedIn y YouTube también son redes, no sitios; sus cuentas se sacan solo si se puede decir con certeza', () => {
    expect(bloque.entNormalizar({ website: 'https://www.facebook.com/mi.negocio' })).toMatchObject({ sitio: null, cuentas: { facebook: 'mi.negocio' } })
    expect(bloque.entNormalizar({ website: 'https://www.tiktok.com/@mi_negocio?lang=es' })).toMatchObject({ sitio: null, cuentas: { tiktok: 'mi_negocio' } })
    expect(bloque.entNormalizar({ website: 'https://www.linkedin.com/company/mi-negocio/' })).toMatchObject({ sitio: null, cuentas: { linkedin: 'mi-negocio' } })
    expect(bloque.entNormalizar({ website: 'https://www.youtube.com/@mi_negocio' })).toMatchObject({ sitio: null, cuentas: { youtube: 'mi_negocio' } })
    // un enlace a una publicación o a una página que no es un perfil: no es sitio y NO inventa una cuenta
    expect(bloque.entNormalizar({ website: 'https://www.instagram.com/p/ABC123/' })).toMatchObject({ sitio: null, cuentas: {} })
    expect(bloque.entNormalizar({ website: 'https://www.facebook.com/profile.php?id=123' })).toMatchObject({ sitio: null, cuentas: {} })
  })
  it('agregadores de enlaces y chats no son un sitio con el texto del negocio', () => {
    for (const w of ['https://linktr.ee/negocio', 'https://wa.me/593999999999', 'https://beacons.ai/x']) {
      const r = bloque.entNormalizar({ website: w })
      expect(r.sitio, w).toBeNull(); expect(r.direccion_era, w).toBe('enlace')
    }
  })
  it('la cuenta suelta se acepta con o sin @ y con la barra del final; lo que no es una cuenta se descarta', () => {
    expect(bloque.entUsuarioDe('instagram', '@zeroriskgye')).toBe('zeroriskgye')
    expect(bloque.entUsuarioDe('instagram', 'zeroriskgye/')).toBe('zeroriskgye')
    expect(bloque.entUsuarioDe('instagram', 'instagram.com/zeroriskgye')).toBe('zeroriskgye')
    expect(bloque.entUsuarioDe('instagram', 'https://facebook.com/x')).toBeNull() // otra red
    expect(bloque.entUsuarioDe('instagram', 'hola mundo!')).toBeNull()
    expect(bloque.entUsuarioDe('instagram', '')).toBeNull()
  })
  it('el MURO de Instagram de la prueba real (las dos formas en que llegó) se reconoce', () => {
    expect(bloque.entEsMuro(MURO_IG, 'https://www.instagram.com/accounts/login/?next=x')).toMatchObject({ es: true, tipo: 'login' })
    expect(bloque.entEsMuro('descripcion create an account or log in to instagram share what you re into with the people who get you')).toMatchObject({ es: true, tipo: 'login' })
  })
  it('bloqueos antirrobots y páginas de error también son paredes', () => {
    expect(bloque.entEsMuro('Just a moment... Verifying you are human. This may take a few seconds.')).toMatchObject({ es: true, tipo: 'bloqueo' })
    expect(bloque.entEsMuro('# 502 Bad Gateway\n\n### Host Not Found or connection failed')).toMatchObject({ es: true, tipo: 'error' })
    expect(bloque.entEsMuro('Inicia sesión para continuar. Crear cuenta nueva.')).toMatchObject({ es: true, tipo: 'login' })
  })
  it('NO marca como pared un sitio real que solo tiene un botón «Iniciar sesión» ni un texto normal', () => {
    expect(bloque.entEsMuro('Somos una empresa de extintores en Guayaquil. Recarga y mantenimiento. Contáctanos.').es).toBe(false)
    expect(bloque.entEsMuro('x'.repeat(6000) + ' Iniciar sesión ' + 'menú '.repeat(80)).es).toBe(false)
    expect(bloque.entEsMuro('').es).toBe(false)
  })
})

describe('«Validate Deal Data»: la entrada del trato', () => {
  const codigo = nodo(nuevo, 'Validate Deal Data').parameters.jsCode as string
  const trato = (extra: Record<string, unknown> = {}) => ({ client_name: 'Empresa X', industry: 'rubro', country: 'EC', city: 'Guayaquil', client_id: 'c-1', ...extra })
  it('el trato de la prueba real (solo Instagram como web + la cuenta aparte): sin sitio, cuenta guardada, aviso dicho', () => {
    const [{ json }] = correr(codigo, { entrada: { body: trato({ website: 'https://www.instagram.com/zeroriskgye', instagram: 'zeroriskgye' }) } })
    expect(json.website).toBeNull()
    expect(json.instagram_handle).toBe('zeroriskgye')
    expect(json._entrada).toMatchObject({ direccion_era: 'instagram', cuentas: { instagram: 'zeroriskgye' }, origen: { instagram: 'dada' } })
    expect(json._entrada.avisos.join(' ')).toMatch(/no un sitio web/)
  })
  it('el mismo trato sin el campo de la cuenta: la saca de la dirección y la guarda donde Persist ya la busca (`instagram_handle`)', () => {
    const [{ json }] = correr(codigo, { entrada: { body: trato({ website: 'https://www.instagram.com/zeroriskgye' }) } })
    expect(json).toMatchObject({ website: null, instagram_handle: 'zeroriskgye' })
  })
  it('si la «web» venía por `domain`, tampoco viaja por ahí', () => {
    const [{ json }] = correr(codigo, { entrada: { body: trato({ domain: 'https://www.instagram.com/zeroriskgye' }) } })
    expect(json.website).toBeNull(); expect(json.domain).toBeNull()
  })
  it('la cuenta dada se guarda LIMPIA (sin @ ni dirección): es la que lee «Persist Client»', () => {
    for (const dada of ['@zeroriskgye', 'https://instagram.com/zeroriskgye/', 'zeroriskgye/']) expect(correr(codigo, { entrada: { body: trato({ instagram: dada }) } })[0].json.instagram_handle, dada).toBe('zeroriskgye')
  })
  it('un sitio real pasa como siempre (y su cuenta de Instagram aparte se conserva)', () => {
    const [{ json }] = correr(codigo, { entrada: { body: trato({ website: 'https://zerorisk.ec', instagram: '@zeroriskgye' }) } })
    expect(json).toMatchObject({ website: 'https://zerorisk.ec', instagram_handle: 'zeroriskgye' })
    expect(json._entrada.avisos).toEqual([])
  })
  it('las guardas de siempre siguen: sin nombre se detiene; dry_run no booleano se detiene; el modo seco se respeta', () => {
    expect(() => correr(codigo, { entrada: { body: trato({ client_name: '' }) } })).toThrow(/ONBOARDING_SIN_NOMBRE/)
    expect(() => correr(codigo, { entrada: { body: trato({ dry_run: 'true' }) } })).toThrow(/DRY_RUN_NO_BOOLEANO/)
    expect(correr(codigo, { entrada: { body: trato({ dry_run: true }) } })[0].json.dry_run).toBe(true)
    expect(correr(codigo, { entrada: { body: trato() } })[0].json.dry_run).toBe(false)
  })
})

describe('«El texto del sitio, o el hueco»', () => {
  const codigo = nodo(nuevo, 'El texto del sitio, o el hueco').parameters.jsCode as string
  const val = (extra: Record<string, unknown> = {}) => ({ website: 'https://zerorisk.ec', _entrada: { avisos: [], cuentas: {} }, ...extra })
  const ir = (servicio: Record<string, unknown>, v = val()) => correr(codigo, { entrada: servicio, nodos: { 'Validate Deal Data': v } })[0]
  it('sin sitio propio: «sin_dato» honesto, NO «sin_respuesta» ni «trajo» (y dice por qué)', () => {
    const r = ir({ ok: true, datos: MURO_IG }, val({ website: null, _entrada: { avisos: ['la dirección «https://www.instagram.com/x» es una cuenta de instagram, no un sitio web'], cuentas: { instagram: 'x' } } })).json
    expect(r.sitio_estado).toBe('sin_dato')
    expect(r.sitio_motivo).toMatch(/no dio un sitio web propio/); expect(r.sitio_motivo).toMatch(/cuenta de instagram/)
    expect(r.sitio_texto).toBe('')
  })
  it('el MURO de la prueba real, aunque el Servicio diga «ok» con datos, NO es el texto del negocio', () => {
    const r = ir({ ok: true, datos: MURO_IG, chunks_count: 1 }).json
    expect(r).toMatchObject({ sitio_estado: 'sin_dato', sitio_texto: '', sitio_caracteres: 0 })
    expect(r.sitio_motivo).toMatch(/muro de inicio de sesión/); expect(r.sitio_era_muro).toMatchObject({ tipo: 'login' })
  })
  it('un bloqueo antirrobots o una página de error tampoco', () => {
    expect(ir({ ok: true, datos: '# 502 Bad Gateway\n\n### Host Not Found or connection failed' }).json.sitio_estado).toBe('sin_dato')
    expect(ir({ ok: true, datos: 'Just a moment... Verifying you are human.' }).json.sitio_estado).toBe('sin_dato')
  })
  it('un sitio real SIGUE siendo «trajo»; el ensayo sigue siendo un hueco; «no contestó» sigue siendo «sin_respuesta»', () => {
    const real = 'Somos una empresa de extintores en Guayaquil. Recarga y mantenimiento de equipos contra incendios para industrias. '.repeat(20)
    expect(ir({ ok: true, datos: real, chunks_count: 3 }).json).toMatchObject({ sitio_estado: 'trajo', sitio_paginas: 3, sitio_era_muro: null })
    expect(ir({ ok: true, datos: real, dry_run: true }).json.sitio_estado).toBe('sin_dato')
    expect(ir({ ok: false, error: 'timeout' }).json.sitio_estado).toBe('sin_respuesta')
    expect(ir({}).json.sitio_estado).toBe('sin_respuesta')
  })
  it('conserva el emparejamiento (los nodos de abajo usan `.item`)', () => {
    expect(ir({ ok: true, datos: 'texto real '.repeat(50) }).pairedItem).toEqual({ item: 0 })
  })
})

describe('«El perfil de la red, o el hueco»', () => {
  const codigo = M.CODIGO_PERFIL as string
  const val = (usuario: string | null) => ({ _entrada: { cuentas: usuario ? { instagram: usuario } : {} } })
  const ir = (servicio: Record<string, unknown>, usuario: string | null = 'zeroriskgye') => correr(codigo, { entrada: servicio, nodos: { 'Validate Deal Data': val(usuario) } })[0]
  const PERFIL = 'Perfil de Instagram · usuario: zeroriskgye\nNombre: Zero Risk\nBiografía: Seguridad Industrial · Venta/recarga extintores · Señalética · Alarmas contra incendio\nSeguidores: 800\nPublicaciones recientes: 12'
  it('con el perfil medido: «trajo», con el usuario y el texto', () => {
    const r = ir({ ok: true, datos: PERFIL, chunks_count: 1 }).json
    expect(r).toMatchObject({ perfil_estado: 'trajo', perfil_usuario: 'zeroriskgye', perfil_motivo: '' })
    expect(r.perfil_texto).toContain('Venta/recarga extintores')
  })
  it('un muro (la red bloqueó la lectura) NO es el perfil; cuenta vacía/privada → sin_dato; no contestó → sin_respuesta; ensayo → hueco', () => {
    expect(ir({ ok: true, datos: MURO_IG }).json).toMatchObject({ perfil_estado: 'sin_dato', perfil_texto: '' })
    expect(ir({ ok: true, datos: '', sin_resultados: true, cero: { motivo: 'cuenta privada' } }).json).toMatchObject({ perfil_estado: 'sin_dato', perfil_motivo: 'cuenta privada' })
    expect(ir({ ok: false, error: 'timeout' }).json).toMatchObject({ perfil_estado: 'sin_respuesta', perfil_motivo: 'timeout' })
    expect(ir({}).json.perfil_estado).toBe('sin_respuesta')
    expect(ir({ ok: true, datos: PERFIL, dry_run: true }).json).toMatchObject({ perfil_estado: 'sin_dato', perfil_texto: '' })
  })
  it('sin cuenta dada no se supone nada; y el texto largo se recorta', () => {
    expect(ir({ ok: true, datos: PERFIL }, null).json).toMatchObject({ perfil_estado: 'sin_dato', perfil_usuario: '', perfil_motivo: 'el trato no trajo una cuenta de Instagram' })
    const largo = ir({ ok: true, datos: 'Biografía y publicaciones del negocio. '.repeat(500) }).json
    expect(largo.perfil_estado).toBe('trajo'); expect(largo.perfil_texto).toMatch(/recortado en 8000 caracteres/)
  })
  it('conserva el emparejamiento (los nodos de abajo usan `.item`)', () => {
    expect(ir({ ok: true, datos: PERFIL }).pairedItem).toEqual({ item: 0 })
  })
})

describe('la tarea del descubridor', () => {
  const cuerpo = nodo(nuevo, 'Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)').parameters.jsonBody as string
  const m = cuerpo.match(/"task": \{\{ ([\s\S]*?) \}\},\n {2}"workflow_id"/)
  it('la expresión de la tarea se encuentra', () => { expect(m).not.toBeNull() })
  const tarea = (perfil: Record<string, unknown>, cuentas: Record<string, string>, sitio: Record<string, unknown> = { sitio_estado: 'sin_dato', sitio_motivo: 'el cliente no dio un sitio web propio' }) => {
    const V = { client_name: 'Empresa X', industry: 'rubro', location: 'Guayaquil, EC', website: null, client_id: 'c-1', _entrada: { cuentas } }
    const $ = (n: string) => {
      const v = n === 'Validate Deal Data' ? V : n === 'El texto del sitio, o el hueco' ? sitio : n === 'El perfil de la red, o el hueco' ? perfil : (() => { throw new Error('nodo inesperado ' + n) })()
      return { item: { json: v }, first: () => ({ json: v }) }
    }
    return new Function('$', 'return (' + m![1] + ')')($) as string
  }
  const PERFIL_OK = { perfil_estado: 'trajo', perfil_usuario: 'zeroriskgye', perfil_motivo: '', perfil_texto: 'Biografía: Seguridad Industrial · Venta/recarga extintores' }
  it('con el perfil medido: lo trae completo, dice que es fuente PROPIA y prohíbe abrir instagram.com con sus herramientas', () => {
    const t = tarea(PERFIL_OK, { instagram: 'zeroriskgye' })
    expect(t).toContain('PERFIL PUBLICO DEL CLIENTE EN INSTAGRAM (@zeroriskgye)')
    expect(t).toContain('Venta/recarga extintores')
    expect(t).toMatch(/No hace falta \(ni sirve\) abrir instagram\.com/)
    expect(t).toContain('NO SE PUDO LEER EL SITIO') // el hueco del sitio sigue declarado
  })
  it('sin poder leer el perfil: lo DICE con sus palabras y prohíbe rellenar con un supuesto', () => {
    const t = tarea({ perfil_estado: 'sin_dato', perfil_usuario: 'zeroriskgye', perfil_motivo: 'cuenta privada', perfil_texto: '' }, { instagram: 'zeroriskgye' })
    expect(t).toContain('NO SE PUDO LEER EL PERFIL DE INSTAGRAM (@zeroriskgye) · cuenta privada')
    expect(t).toContain('no se pudo leer el perfil'); expect(t).toMatch(/NO lo rellenes con un supuesto/)
    expect(t).not.toContain('PERFIL PUBLICO DEL CLIENTE')
  })
  it('la cuenta DADA manda: lo dice en la tarea, manda reportar otras como DUDAS y fija own_handles', () => {
    const t = tarea(PERFIL_OK, { instagram: 'zeroriskgye', facebook: 'mi.negocio' })
    expect(t).toContain('CUENTAS PROPIAS DADAS POR QUIEN CERRO EL TRATO (MANDAN')
    expect(t).toContain('instagram @zeroriskgye'); expect(t).toContain('facebook @mi.negocio')
    expect(t).toMatch(/posible otra cuenta/); expect(t).toMatch(/own_handles de la herramienta emit_discovery_output deja SIEMPRE la cuenta dada/)
  })
  it('sin cuenta dada no se agrega nada de eso (y el resto de la tarea no cambia)', () => {
    const t = tarea({ perfil_estado: 'sin_dato', perfil_usuario: '', perfil_motivo: 'el trato no trajo una cuenta de Instagram', perfil_texto: '' }, {})
    expect(t).not.toContain('CUENTAS PROPIAS DADAS'); expect(t).not.toContain('PERFIL')
    expect(t).toContain('GEOGRAPHIC ANCHOR (MANDATORY · GIVEN — DO NOT INFER IT)'); expect(t).toContain('EVIDENCE RULES (mandatory)')
  })
})

describe('la forma del flujo', () => {
  it('solo cambian 3 nodos y se agregan 4; todo lo demás igual', () => {
    const cambiados = nuevo.nodes.filter((n) => { const a = nodo(antes, n.name); return a && JSON.stringify(a) !== JSON.stringify(n) }).map((n) => n.name)
    expect(cambiados.sort()).toEqual(['Call Onboarding Specialist: Auto-Discovery Dispatch (fire+forget)', 'El texto del sitio, o el hueco', 'Validate Deal Data'].sort())
    expect(nuevo.nodes.filter((n) => !nodo(antes, n.name)).map((n) => n.name).sort()).toEqual([M.N_SI_SITIO, M.N_SI_CUENTA, M.N_LEER_PERFIL, M.N_PERFIL].sort())
    expect(nuevo.nodes.length).toBe(antes.nodes.length + 4)
  })
  it('los cables: Validate → IF sitio (y sigue el aviso a la sala) · sí → leer sitio · no → texto · texto → IF cuenta · sí → perfil · no → hueco · hueco → despacho', () => {
    const c = nuevo.connections
    expect(c['Validate Deal Data'].main[0].map((x) => x.node)).toEqual([M.N_SI_SITIO, '[MODELB] Phase-boundary Emit · reconciliación OBSERVE'])
    expect(c[M.N_SI_SITIO].main.map((l) => l.map((x) => x.node))).toEqual([[M.N_LEER_SITIO], [M.N_TEXTO_SITIO]])
    expect(c[M.N_LEER_SITIO].main[0].map((x) => x.node)).toEqual([M.N_TEXTO_SITIO])
    expect(c[M.N_TEXTO_SITIO].main[0].map((x) => x.node)).toEqual([M.N_SI_CUENTA])
    expect(c[M.N_SI_CUENTA].main.map((l) => l.map((x) => x.node))).toEqual([[M.N_LEER_PERFIL], [M.N_PERFIL]])
    expect(c[M.N_LEER_PERFIL].main[0].map((x) => x.node)).toEqual([M.N_PERFIL])
    expect(c[M.N_PERFIL].main[0].map((x) => x.node)).toEqual([M.N_DESPACHO])
    // el resto de los cables, idénticos
    for (const k of Object.keys(antes.connections)) if (!['Validate Deal Data', M.N_TEXTO_SITIO].includes(k)) expect(JSON.stringify(c[k]), k).toBe(JSON.stringify(antes.connections[k]))
  })
  it('las condiciones de los IF se evalúan bien con los datos de la prueba real', () => {
    const expr = (n: string) => (nodo(nuevo, n).parameters.conditions.conditions[0].leftValue as string).replace(/^=\{\{ /, '').replace(/ \}\}$/, '')
    const ev = (n: string, V: Record<string, unknown>) => new Function('$', 'return (' + expr(n) + ')')(() => ({ first: () => ({ json: V }) }))
    expect(ev(M.N_SI_SITIO, { website: null })).toBe(false)
    expect(ev(M.N_SI_SITIO, { website: '  ' })).toBe(false)
    expect(ev(M.N_SI_SITIO, { website: 'https://zerorisk.ec' })).toBe(true)
    expect(ev(M.N_SI_CUENTA, { _entrada: { cuentas: { instagram: 'zeroriskgye' } } })).toBe(true)
    expect(ev(M.N_SI_CUENTA, { _entrada: { cuentas: {} } })).toBe(false)
    expect(ev(M.N_SI_CUENTA, {})).toBe(false)
  })
  it('el pedido del perfil: Servicio de Apify, `instagram_scraper`, destino `respuesta` (no escribe en el cerebro), sin reintento, sigue ante error, y respeta el modo seco', () => {
    const n = nodo(nuevo, M.N_LEER_PERFIL)
    expect(n.parameters.url).toBe(nodo(antes, M.N_LEER_SITIO).parameters.url)
    expect((n as any).onError).toBe('continueRegularOutput'); expect((n as any).retryOnFail).toBeUndefined()
    const cuerpo = n.parameters.jsonBody as string
    const V = { client_id: 'c-1', dry_run: true, _entrada: { cuentas: { instagram: 'zeroriskgye' } } }
    const enviado = JSON.parse(new Function('$', 'return (' + cuerpo.replace(/^=\{\{ /, '').replace(/ \}\}$/, '') + ')')(() => ({ first: () => ({ json: V }) })))
    expect(enviado).toMatchObject({ client_id: 'c-1', apify_function: 'instagram_scraper', destination: 'respuesta', dry_run: true, params: { usernames: ['zeroriskgye'], resultsLimit: 12 } })
    const real = JSON.parse(new Function('$', 'return (' + cuerpo.replace(/^=\{\{ /, '').replace(/ \}\}$/, '') + ')')(() => ({ first: () => ({ json: { ...V, dry_run: false } }) })))
    expect(real.dry_run).toBe(false)
  })
  it('🔴 LINAJE: el ANTES es EXACTAMENTE el estado que dejó el modo seco del alta; el constructor reproduce el ARREGLADO y no se construye dos veces', () => {
    const seco = JSON.parse(fs.readFileSync(path.resolve(D, '../modo-seco/LyVoKcrypS5uLyuu-ARREGLADO-seco-2026-10-19.json'), 'utf8')) as Flujo
    expect(JSON.stringify(antes.nodes.map((n) => [n.name, n.parameters]))).toBe(JSON.stringify(seco.nodes.map((n) => [n.name, n.parameters])))
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => M.construirFlujo(nuevo)).toThrow(/ya trae/)
  })
  it('sin llaves pegadas ni nombres de clientes en lo agregado', () => {
    const agregado = M.BLOQUE + M.CODIGO_PERFIL
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
    for (const p of ['naufrago', 'náufrago', 'zeroriskgye', 'zerorisk', 'guayaquil', 'olon']) expect(agregado.toLowerCase().includes(p), p).toBe(false)
  })
})
