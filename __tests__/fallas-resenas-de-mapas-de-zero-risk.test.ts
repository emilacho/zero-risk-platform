/**
 * Reseñas de Mapas de Zero Risk (01-nov · encargo «fallas pendientes y retención», punto 2a).
 * Medido el 01-nov: las «28 reseñas sin texto» eran las de OTRO negocio — «Riesgo Cero» de San Luis Potosí, México — que la búsqueda por nombre trajo como ficha propia.
 * La ficha REAL de Zero Risk (Guayaquil · zeroriskecuador.com) existe y no tiene reseñas en Google. El cable de reseñas ya existe (`resenas_google_maps`) y solo pide las de una ficha confirmada.
 * US$ 0, sin red.
 */
import { describe, it, expect } from 'vitest'
import { contextoDelCliente } from '../src/lib/portero-alimenta/alimentar'
import { fichaPropiaDeMapas } from '../src/lib/portero-alimenta/mapas-propia'
import { unidadesDeRaspados } from '../src/lib/portero-alimenta/unidades'

const cliente = { id: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', name: 'Zero Risk', industry: 'seguridad industrial y extintores', city: 'Guayaquil', website_url: 'http://www.zeroriskecuador.com/', config: { apify: { own_handles: { instagram: 'zeroriskgye' } } } }
const ctx = contextoDelCliente(cliente as never, [{ ciudad: 'Guayaquil', clave: 'gye' }])
const homonimo = { title: 'Riesgo Cero - Equipo de Seguridad Industrial', address: 'Av Industrias 3840, Español, 78398 San Luis Potosí, S.L.P., México', city: 'San Luis Potosí', phone: '+52 444 246 4025', categoryName: 'Proveedor de equipos de seguridad', reviewsCount: 28, totalScore: 3.9, placeId: 'ChIJgzY3ZrqjKoQRj1mDHs-8tig' }
const propia = { title: 'Zero Risk', address: '090902 Guayaquil, Ecuador', city: 'Guayaquil', website: 'http://www.zeroriskecuador.com/', phone: '+593 99 792 6121', reviewsCount: null, totalScore: null, placeId: 'ChIJBad1SVNzLZARvrTd-E1G-R0' }

describe('2a · Zero Risk y Mapas', () => {
  it('🔴 el homónimo mexicano (28 reseñas) NO es la ficha de Zero Risk', () => {
    const r = fichaPropiaDeMapas([homonimo], ctx)
    expect(r.ficha).toBeNull()
  })
  it('la ficha real (sitio y ciudad propios) se confirma aunque venga junto al homónimo', () => {
    const r = fichaPropiaDeMapas([homonimo, propia], ctx)
    expect(r.ficha?.placeId).toBe('ChIJBad1SVNzLZARvrTd-E1G-R0')
    expect(r.ambigua).toBe(false)
  })
  it('del homónimo no salen cifras ni reseñas como si fueran del cliente', () => {
    const fila = { id: 'm1', apify_function: 'own_google_maps_profile', ensayo: false, created_at: '2026-10-20T19:50:56Z', respuesta: [homonimo] }
    const us = unidadesDeRaspados([fila], { propios: { sitio: 'http://www.zeroriskecuador.com/', handles: ['zeroriskgye'] }, fichaDeMapas: (items: Array<Record<string, unknown>>) => fichaPropiaDeMapas(items, ctx).ficha } as never)
    expect(us.filter((u) => u.fuente === 'mapas' || u.fuente === 'resenas' || u.fuente === 'metrica')).toHaveLength(0)
  })
})
