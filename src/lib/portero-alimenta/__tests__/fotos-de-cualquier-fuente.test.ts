/**
 * FOTOS Y LOGO DE CUALQUIER FUENTE (21-oct · manual visual «todas las fuentes», firma de Emilio 19:55 Berlín): el cerebro indexa las copias de fotos/logo PROPIOS vengan de donde vengan
 * (Instagram, Facebook, el sitio, Mapas, archivos del dueño), también de un cliente sin sitio o sin Instagram. El escritor único de la tabla de fotos no se toca: aquí solo se LEE. US$ 0 · los diez clientes.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../../cerebro/lista-corta'
import { fuenteDeLaCopia } from '../../cerebro/lectores'
import { leerContenido } from '../../cerebro/contenido'
import { crearBaseFalsa } from '../../cerebro/__tests__/casos'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe } from './diez-clientes.tablas'
import { AHORA } from './fixtures-despertar'

const fila = (c: ClienteSintetico, o: Record<string, unknown>) => ({ id: `img-${Math.random().toString(36).slice(2, 10)}`, client_id: c.id, owner_role: 'propio', handle: 'cuenta', post_id: `p-${Math.random().toString(36).slice(2, 8)}`, tipo: 'post_image', medio: 'imagen', estado: 'ok', url: 'https://ejemplo.supabase.co/storage/v1/object/public/client-social-images/x.jpg', caption: 'texto de la imagen', posted_at: null, post_url: null, producto: null, created_at: '2026-10-20T12:00:00Z', ...o })

/** copias de cada fuente, solo de las que ese cliente tiene (uno sin sitio, uno sin Instagram…) */
function copiasDe(c: ClienteSintetico) {
  const out: Array<{ fila: Record<string, unknown>; fuente: string | null; clase: string; publicacion: boolean }> = []
  if (c.ig) out.push({ fila: fila(c, { handle: c.ig, tipo: 'post_image', post_url: `https://www.instagram.com/p/${c.ig}1/`, posted_at: '2026-10-10T10:00:00Z' }), fuente: 'Instagram', clase: 'foto', publicacion: true })
  if (c.ig) out.push({ fila: fila(c, { handle: c.ig, tipo: 'post_video', medio: 'reel', post_url: `https://www.instagram.com/reel/${c.ig}2/`, posted_at: '2026-10-11T10:00:00Z' }), fuente: 'Instagram', clase: 'portada_de_video', publicacion: true })
  if (c.web) {
    out.push({ fila: fila(c, { handle: c.web.replace(/^https?:\/\//, ''), tipo: 'sitio_logo', medio: 'logo', caption: null }), fuente: 'el sitio web', clase: 'logo', publicacion: false })
    out.push({ fila: fila(c, { handle: c.web.replace(/^https?:\/\//, ''), tipo: 'sitio_imagen', medio: 'imagen', caption: 'foto del local' }), fuente: 'el sitio web', clase: 'foto', publicacion: false })
  }
  out.push({ fila: fila(c, { handle: 'facebook-propio', tipo: 'post_image', post_url: 'https://www.facebook.com/negocio/posts/123', posted_at: '2026-10-09T10:00:00Z' }), fuente: 'Facebook', clase: 'foto', publicacion: true })
  out.push({ fila: fila(c, { handle: 'mapas', tipo: 'mapas_foto', medio: 'imagen', caption: null }), fuente: 'la ficha de Mapas', clase: 'foto', publicacion: false })
  out.push({ fila: fila(c, { handle: 'dueno', tipo: 'archivo_dueno', medio: 'imagen', caption: 'subida por el dueño' }), fuente: 'un archivo del dueño', clase: 'foto', publicacion: false })
  out.push({ fila: fila(c, { handle: 'dueno', tipo: 'archivo_dueno_logo', medio: null, caption: null }), fuente: 'un archivo del dueño', clase: 'logo', publicacion: false })
  return out
}

describe('el cerebro indexa las copias propias de cualquier fuente', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}${c.web ? '' : ', sin sitio'}${c.ig ? '' : ', sin Instagram'}): cada copia entra como cosa PROPIA con su clase y su fuente`, async () => {
      const copias = copiasDe(c)
      const competidor = fila(c, { owner_role: 'competidor', handle: 'rival', tipo: 'post_image', post_url: 'https://www.instagram.com/p/zzz/', posted_at: '2026-10-12T10:00:00Z' })
      const t = { ...tablasDe(c), client_social_images: [...copias.map((x) => x.fila), competidor] }
      const lista = await construirListaCorta(crearBaseFalsa(t as never).consulta, c.id, { ahora: AHORA })
      expect(lista.fuentes.fotos.estado).toBe('ok')
      for (const x of copias) {
        const l = lista.lineas.find((y) => y.ref === `client_social_images:${x.fila.id}`)
        expect(l, `${x.fuente} ${x.fila.tipo}`).toBeTruthy()
        expect(l!.clase, String(x.fila.tipo)).toBe(x.clase)
        expect(l!.estante, String(x.fila.tipo)).toBe('E3') // propio
        if (x.publicacion) expect(l!.que_es).toMatch(/texto de la publicación/)
        else { expect(l!.que_es).toMatch(new RegExp(`copia propia de ${x.fuente}`)); expect(l!.que_es).not.toMatch(/publicación/) }
      }
      // lo del competidor sigue en su estante
      expect(lista.lineas.find((y) => y.ref === `client_social_images:${competidor.id}`)?.estante).toBe('E5')
      // un cliente sin sitio igual tiene su logo (de otra fuente) y sus fotos
      expect(lista.lineas.filter((y) => y.estante === 'E3' && ['foto', 'logo', 'portada_de_video'].includes(y.clase)).length).toBe(copias.length)
      if (!c.web) expect(copias.some((x) => x.fuente === 'el sitio web')).toBe(false)
    })
  }
  it('la fuente se deduce de lo que la propia fila dice', () => {
    expect(fuenteDeLaCopia({ post_url: 'https://www.instagram.com/p/x', tipo: 'post_image' })).toEqual({ fuente: 'Instagram', esPublicacion: true })
    expect(fuenteDeLaCopia({ post_url: 'https://fb.com/x', tipo: 'post_image' })).toEqual({ fuente: 'Facebook', esPublicacion: true })
    expect(fuenteDeLaCopia({ tipo: 'sitio_logo' })).toEqual({ fuente: 'el sitio web', esPublicacion: false })
    expect(fuenteDeLaCopia({ tipo: 'mapas_foto' })).toEqual({ fuente: 'la ficha de Mapas', esPublicacion: false })
    expect(fuenteDeLaCopia({ tipo: 'archivo_dueno' })).toEqual({ fuente: 'un archivo del dueño', esPublicacion: false })
    expect(fuenteDeLaCopia({ tipo: 'post_image' })).toEqual({ fuente: null, esPublicacion: true }) // un post sin enlace sigue siendo un post
    expect(fuenteDeLaCopia({ tipo: 'algo_nuevo' })).toEqual({ fuente: null, esPublicacion: false }) // una fuente que aún no existe entra igual, sin etiqueta
  })
  it('el texto que se indexa de una copia que no es publicación no habla de «la publicación»', async () => {
    const c = DIEZ_CLIENTES[0]
    const sitio = fila(c, { tipo: 'sitio_logo', medio: 'logo', caption: 'logotipo del negocio' })
    const post = fila(c, { tipo: 'post_image', post_url: 'https://www.instagram.com/p/x/', posted_at: '2026-10-10T10:00:00Z', caption: 'una novedad' })
    const lector = async (ref: string) => { const r = await leerContenido(crearBaseFalsa({ client_social_images: [sitio, post] } as never).consulta, c.id, ref); return JSON.stringify(r) }
    const a = await lector(`client_social_images:${sitio.id}`); const b = await lector(`client_social_images:${post.id}`)
    expect(a).toMatch(/Texto asociado: logotipo del negocio/); expect(a).not.toMatch(/publicación|Publicada el/)
    expect(b).toMatch(/Texto de la publicación: una novedad/); expect(b).toMatch(/Publicada el 2026-10-10/)
  })
})
