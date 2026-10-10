/** R3 certeza · R4 procedencia · R5 sede≠origen · R7 dudas · y la frontera: lo creativo NO se chequea. Cliente sintético (una clínica dental inventada). Sin modelo. */
import { describe, expect, it } from 'vitest'
import { buscarCerteza, declaracionDelCliente, detectarDudas, dudasAtadas, evaluarHechos, frasePideOrigen, hojasDeTexto, lugaresMencionados, mencionaCerteza, palabrasDe, papelDelLugar, respaldoDeOrigen, resolverCita, tipoDeFuenteDeCerebro } from '..'
import { F } from './apoyo'

const propio = (id: string, t: string, canal: 'sitio' | 'instagram' = 'sitio') => F(id, 'primaria_propia', t, canal)
const humana = (id: string, t: string) => F(id, 'humana', t, 'alta', 'dato')
const sintesis = (id: string, t: string) => F(id, 'sintesis', t, 'otro')
const evalua = (manual: Record<string, unknown>, fuentes: ReturnType<typeof F>[], extra: Partial<Parameters<typeof evaluarHechos>[0]> = {}) => evaluarHechos({ manual, fuentes, ...extra })
const estadoDe = (r: ReturnType<typeof evaluarHechos>, parte: string) => r.hechos.find((h) => h.clausula.includes(parte) || h.frase.includes(parte))?.estado

describe('R3 · palabras de certeza (dato, por frase, nunca por palabra suelta)', () => {
  it('detecta las secuencias de la lista; una raíz cubre sus derivados; «primero» suelto no es certeza', () => {
    const ids = (t: string) => buscarCerteza(palabrasDe(t)).map((m) => m.id)
    expect(ids('Un servicio certificado y garantizado')).toEqual(['certificado', 'garantia'])
    expect(ids('la única opción, sin igual, líder del mercado')).toEqual(expect.arrayContaining(['unico', 'sin_igual', 'lider']))
    expect(ids('Trazable y con trazabilidad')).toEqual(['trazabilidad', 'trazabilidad'])
    expect(ids('ningún competidor lo hace')).toContain('ningun_competidor')
    expect(ids('el mejor y la mejor')).toEqual(['el_mejor', 'la_mejor'])
    expect(ids('compara primero por precio')).toEqual([]) // adverbio: no es «el primero»
    expect(ids('somos el primero en la ciudad')).toEqual(expect.arrayContaining(['el_primero', 'primero_en']))
    expect(mencionaCerteza(palabrasDe('es verificable en su sitio'), 'verificable')).toBe(true)
  })

  it('una certeza SIN cita sale `sin_cita`; con la misma palabra y contexto en una fuente propia sale «afirmación del cliente», NUNCA «verificado»', () => {
    const manual = { positioning: 'La clínica ofrece implantes certificados para adultos mayores.' }
    expect(estadoDe(evalua(manual, []), 'certificados')).toBe('sin_cita')
    const propia = propio('s', 'Hacemos implantes certificados para adultos mayores con cita previa.')
    const r = evalua(manual, [propia])
    expect(estadoDe(r, 'certificados')).toBe('afirmacion_del_cliente')
    expect(r.hechos[0]).toMatchObject({ cita_literal: 'Hacemos implantes certificados para adultos mayores con cita previa.', fuente: { id: 's', tipo: 'primaria_propia' }, motivo: 'lo dice el cliente de sí mismo' })
  })
  it('solo una fuente HUMANA (alta, ficha con firma) verifica una certeza', () => {
    const manual = { positioning: 'La clínica ofrece implantes certificados para adultos mayores.' }
    expect(estadoDe(evalua(manual, [humana('h', 'La dueña confirma que los implantes certificados para adultos mayores existen.')]), 'certificados')).toBe('verificado')
  })
  it('R4 · si solo lo respalda un resumen de agente: `solo_sintesis` (no es fuente)', () => {
    const manual = { positioning: 'La clínica ofrece implantes certificados para adultos mayores.' }
    expect(estadoDe(evalua(manual, [sintesis('x', 'Se diferencia por implantes certificados para adultos mayores.')]), 'certificados')).toBe('solo_sintesis')
  })
  it('una palabra presente en OTRO contexto no respalda la afirmación', () => {
    const manual = { positioning: 'La clínica es la única que atiende urgencias nocturnas de ortodoncia.' }
    const r = evalua(manual, [propio('s', 'Nuestra única sede está en el centro, junto a la plaza principal.')])
    expect(estadoDe(r, 'única')).toBe('sin_cita')
  })
  it('una cláusula que reproduce LITERAL lo que dice el cliente es «afirmación del cliente» aunque no comparta otro contexto', () => {
    const r = evalua({ positioning: 'Somos los mejores del barrio.' }, [propio('s', 'Hola. Somos los mejores del barrio. Ven a vernos.')])
    expect(r.hechos[0].estado).toBe('afirmacion_del_cliente')
  })
  it('la cita del AUTOR: inexistente, de otra fuente o sin la palabra ⇒ `sin_cita`; buena ⇒ por el tipo de la fuente', () => {
    const manual = { positioning: 'La clínica ofrece implantes certificados.' }
    const fuentes = [propio('s', 'Implantes certificados y con garantía en nuestro consultorio.'), propio('t', 'Atendemos de lunes a viernes.')]
    const frase = 'La clínica ofrece implantes certificados.'
    expect(estadoDe(evalua(manual, fuentes, { citas: [{ frase, literal: 'implantes inventados', fuente_id: 's' }] }), 'certificados')).toBe('sin_cita')
    expect(evalua(manual, fuentes, { citas: [{ frase, literal: 'Implantes certificados', fuente_id: 'nope' }] }).hechos[0].motivo).toBe('cita_de_fuente_desconocida')
    expect(evalua(manual, fuentes, { citas: [{ frase, literal: 'Atendemos de lunes', fuente_id: 't' }] }).hechos[0].motivo).toBe('la_cita_no_dice_la_palabra')
    expect(estadoDe(evalua(manual, fuentes, { citas: [{ frase, literal: 'Implantes certificados y con garantía', fuente_id: 's' }] }), 'certificados')).toBe('afirmacion_del_cliente')
  })
})

describe('cifras, fechas y citas atribuidas (por presencia, declarado)', () => {
  it('una cifra presente en lo propio sale verificada; ausente ⇒ sin_cita; solo en un resumen ⇒ solo_sintesis; en un tercero ⇒ verificada PERO dicho que es del mercado', () => {
    const manual = { customer_angle: 'Tiene 1,231 seguidores, y sus consultas cuestan $45 al mes.' }
    const r = evalua(manual, [propio('i', 'Perfil con 1.231 seguidores', 'instagram')])
    expect(r.hechos.find((h) => h.detalle.some((d) => d.texto === '1231'))!.estado).toBe('verificado')
    expect(r.hechos.find((h) => h.detalle.some((d) => d.texto === '45'))!.estado).toBe('sin_cita')
    expect(evalua(manual, [sintesis('x', 'cuesta $45')]).hechos.find((h) => h.detalle.some((d) => d.texto === '45'))!.estado).toBe('solo_sintesis')
    const t = evalua({ positioning: 'Los competidores cobran $60.' }, [F('c', 'tercero', 'Consulta $60 hoy', 'sitio')])
    expect(t.hechos[0]).toMatchObject({ estado: 'verificado', motivo: 'respaldo de un tercero: habla del mercado, no del cliente' })
  })
  it('una cifra suelta de un dígito sin signo no es un dato; un año va por «fecha»', () => {
    expect(evalua({ icp_summary: 'SEGMENTO 1 y 2 de los pacientes' }, []).hechos).toEqual([])
    const r = evalua({ mision: 'Atendemos desde 2012 con calidez.' }, [])
    expect(r.hechos[0]).toMatchObject({ marcas: ['fecha'], estado: 'sin_cita' })
    expect(evalua({ mision: 'Atendemos desde 2012 con calidez.' }, [propio('s', 'Fundada en 2012 en el centro')]).hechos[0].estado).toBe('verificado')
  })
  it('una cita entre comillas es un HECHO solo si la frase se la atribuye a alguien; si no, es un ejemplo de redacción y es creativa (no se chequea)', () => {
    const fuentes = [propio('s', 'Tu sonrisa, nuestro orgullo. Agenda ya.')]
    expect(evalua({ voice_description: 'Usa frases como "mil sonrisas al día" y similares.' }, fuentes).hechos).toEqual([])
    const r = evalua({ voice_description: 'Según su sitio, el cliente dice "Tu sonrisa, nuestro orgullo".' }, fuentes)
    expect(r.hechos.find((h) => h.marcas.includes('cita'))!.estado).toBe('verificado')
    expect(evalua({ voice_description: 'Según su sitio, dice "una frase que nunca escribió".' }, fuentes).hechos.find((h) => h.marcas.includes('cita'))!.estado).toBe('sin_cita')
  })
})

describe('R5 · el lugar de la empresa NO es el origen del producto', () => {
  it('el papel de un lugar lo dan patrones sobre la oración de la fuente', () => {
    expect(papelDelLugar('Nuestro local está en Playa Azul.', 'Playa Azul')).toBe('sede')
    expect(papelDelLugar('Entregamos en Playa Azul y alrededores.', 'Playa Azul')).toBe('reparto')
    expect(papelDelLugar('Traemos los insumos de Playa Azul cada mañana.', 'Playa Azul')).toBe('origen_producto')
    expect(papelDelLugar('Atendemos a turistas de Playa Azul.', 'Playa Azul')).toBe('mercado')
    expect(papelDelLugar('Lo mejor de Playa Azul.', 'Playa Azul')).toBe('sin_papel')
    expect(papelDelLugar('No habla de otro lugar.', 'Playa Azul')).toBeNull()
    expect(papelDelLugar('Vamos a 📍 Playa Azul', 'Playa Azul')).toBe('sede')
  })
  it('reconoce cuándo una frase pide origen y qué lugares nombra (la primera palabra de la frase no cuenta)', () => {
    expect(frasePideOrigen('El producto viene de Playa Azul')).toBe(true)
    expect(frasePideOrigen('Con origen verificado')).toBe(true)
    expect(frasePideOrigen('Un producto excelente')).toBe(false)
    expect(lugaresMencionados('Playa Azul es bonito, viene de Cerro Alto y Puerto Seco')).toEqual(['Cerro Alto', 'Puerto Seco'])
  })
  it('una sede o un lugar sin papel NO sostiene «viene de»; solo el papel de origen del producto lo sostiene', () => {
    const manual = { propuestas_de_valor: ['Los insumos vienen de Playa Azul'] }
    const sede = evalua(manual, [propio('s', 'Nuestro local está en Playa Azul. Lo mejor de Playa Azul.')])
    expect(sede.hechos[0]).toMatchObject({ estado: 'sin_cita', motivo: 'sede_no_es_origen', marcas: ['lugar'] })
    const sinPapel = evalua(manual, [propio('s', 'Lo mejor de Playa Azul.')])
    expect(sinPapel.hechos[0]).toMatchObject({ estado: 'sin_cita', motivo: 'lugar_sin_papel_de_origen' })
    expect(evalua(manual, [propio('s', 'Nada de ese lugar.')]).hechos[0].motivo).toBe('lugar_ausente_de_las_fuentes')
    const ok = evalua(manual, [propio('s', 'Traemos los insumos de Playa Azul cada mañana.')])
    expect(ok.hechos[0]).toMatchObject({ estado: 'verificado', cita_literal: 'Traemos los insumos de Playa Azul cada mañana.' })
  })
  it('lo que el cliente dice de sí mismo con esas mismas palabras es «afirmación del cliente», no un hecho; y un resumen de agente tampoco sostiene un origen', () => {
    const manual = { propuestas_de_valor: ['Los insumos vienen de Playa Azul'] }
    expect(evalua(manual, [propio('s', 'Hola. Los insumos vienen de Playa Azul. Ven.')]).hechos[0].estado).toBe('afirmacion_del_cliente')
    expect(evalua(manual, [sintesis('x', 'Traemos los insumos de Playa Azul.')]).hechos[0].estado).toBe('solo_sintesis')
  })
  it('`respaldoDeOrigen` elige el papel más fuerte entre las fuentes primarias', () => {
    const r = respaldoDeOrigen(['Playa Azul'], [propio('a', 'Nuestro local en Playa Azul.'), propio('b', 'Compramos en Playa Azul cada día.')])
    expect(r).toMatchObject({ papel: 'origen_producto' })
    expect(respaldoDeOrigen(['Playa Azul'], [sintesis('a', 'Compramos en Playa Azul.')])).toBeNull() // solo primarias por omisión
  })
})

describe('R7 · la duda del modelo se conserva y se ata a la afirmación', () => {
  const textos = [{ origen: 'ICP · objeciones', texto: '["No sé si el producto realmente viene de Playa Azul o es marketing","Precio alto"]' }, { origen: 'resumen', texto: 'Todo claro. Quizás cambie el precio.' }]
  it('detecta las marcas de duda (incluidas las de una lista JSON) y no confunde palabras comunes', () => {
    const d = detectarDudas(textos)
    expect(d.map((x) => x.frase)).toEqual(['No sé si el producto realmente viene de Playa Azul o es marketing'])
    expect(detectarDudas([{ origen: 'x', texto: 'Realmente fresco y claro.' }])).toEqual([])
  })
  it('se ata solo si comparten términos de contenido; una afirmación con duda atada NO queda «verificada»', () => {
    const d = detectarDudas(textos)
    expect(dudasAtadas('El producto viene de Playa Azul', d)).toHaveLength(1)
    expect(dudasAtadas('Atendemos con cita previa', d)).toHaveLength(0)
    const fuentes = [propio('s', 'Traemos el producto de Playa Azul cada mañana.')]
    const manual = { positioning: 'El producto viene de Playa Azul.' }
    expect(evalua(manual, fuentes).hechos[0].estado).toBe('verificado')
    const con = evalua(manual, fuentes, { dudas: d })
    expect(con.hechos[0]).toMatchObject({ estado: 'con_duda', duda: 'No sé si el producto realmente viene de Playa Azul o es marketing' })
    expect(con.sin_respaldo).toHaveLength(1)
  })
  it('la duda NO baja una afirmación del cliente (la atribución ya dice quién lo afirma)', () => {
    const d = detectarDudas(textos)
    expect(evalua({ positioning: 'El producto viene de Playa Azul.' }, [propio('s', 'Hola. El producto viene de Playa Azul. Ven.')], { dudas: d }).hechos[0].estado).toBe('afirmacion_del_cliente')
  })
})

describe('la FRONTERA: lo creativo no se chequea jamás', () => {
  it('un manual sin marcas de hecho no da ningún hallazgo, aunque sea feo, exagerado o vacío de contenido', () => {
    const manual = {
      voice_description: 'Voz cálida, cercana, juguetona, con humor y mucha energía. Tutea siempre.',
      personalidad: ['Optimista', 'Curioso', 'Atrevido'],
      mision: 'Hacer felices a las personas con cada visita, de una manera que nadie olvide.',
      propuestas_de_valor: ['Una experiencia que se siente distinta', 'Cercanía de verdad'],
      mensajes_clave: ['Tu sonrisa importa', 'Aquí te escuchamos'],
    }
    expect(evalua(manual, []).hechos).toEqual([])
  })
  it('una frase creativa que CONTIENE una marca: solo esa cláusula se evalúa; el resto de la frase se respeta', () => {
    const r = evalua({ propuestas_de_valor: ['Una experiencia cálida y cercana, con trazabilidad verificable, pensada para ti'] }, [])
    expect(r.hechos.map((h) => h.clausula)).toEqual(['con trazabilidad verificable'])
  })
  it('las listas de términos, los colores y lo que escribe el código no son prosa a chequear; las rutas de arreglos y objetos se siguen', () => {
    const manual = { forbidden_words: ['el mejor'], required_terminology: ['único'], tagline: 'El mejor lugar', primary_colors: ['#fff'], _build: { x: 'único' }, ficha: { nota: 'Somos únicos' }, lista: ['a', 'Somos únicos'] }
    expect(hojasDeTexto(manual).map((h) => h.ruta)).toEqual(['ficha.nota', 'lista[0]', 'lista[1]'])
    expect(evalua(manual, []).hechos.map((h) => h.ruta)).toEqual(['ficha.nota', 'lista[1]'])
  })
  it('lo ya cerrado (PENDIENTE y «el cliente dice») no se vuelve a evaluar', () => {
    const manual = { positioning: `Bonito. PENDIENTE: afirmación sin fuente («único»). ${declaracionDelCliente('Somos únicos en la ciudad')}.` }
    expect(evalua(manual, []).hechos).toEqual([])
  })
})

describe('R4 · tipos de fuente y resolución de citas', () => {
  it('lo que escribe un agente es síntesis; ante la duda también; el raspado propio es primaria y el de terceros, tercero', () => {
    expect(tipoDeFuenteDeCerebro({ source_table: 'client_icp_documents' })).toBe('sintesis')
    expect(tipoDeFuenteDeCerebro({ provenance_source: 'agent_synthesis' })).toBe('sintesis')
    expect(tipoDeFuenteDeCerebro({ source_table: 'otra_tabla' })).toBe('sintesis')
    expect(tipoDeFuenteDeCerebro({ es_raspado_propio: true })).toBe('primaria_propia')
    expect(tipoDeFuenteDeCerebro({ es_raspado_tercero: true })).toBe('tercero')
  })
  it('una cita existe solo si está TAL CUAL (sin tildes ni mayúsculas, palabras completas) en la fuente que dice', () => {
    const fs = [propio('s', 'Atendemos de LUNES a viernes, con cita.')]
    expect(resolverCita({ literal: 'lunes a viernes', fuente_id: 's' }, fs)).toMatchObject({ existe: true, tipo: 'primaria_propia' })
    expect(resolverCita({ literal: 'lunes a sábado', fuente_id: 's' }, fs)).toMatchObject({ existe: false, motivo: 'no_esta_en_la_fuente' })
    expect(resolverCita({ literal: 'lunes', fuente_id: 'otra' }, fs)).toMatchObject({ existe: false, motivo: 'fuente_desconocida' })
    expect(resolverCita(null, fs).existe).toBe(false)
  })
})
