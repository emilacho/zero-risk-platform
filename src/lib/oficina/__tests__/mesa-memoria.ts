/** ayuda de pruebas de la mesa: el libro y el directorio en memoria (mismo contrato que el adaptador de Supabase) */
import type { Aporte, NuevoAporte, PuertoMesa, Tarjeta } from '../mesa/tipos'

export const DIRECTORIO: Tarjeta[] = [
  { agente: 'creative-director-mesa', rol: 'direccion', especialidad: 'dirección creativa', sabe_hacer: ['idea rectora', 'integrar'], necesita: ['manual', 'brief'], entrega: ['pieza completa'], pertinente_en: [], activo: true, version: 1 },
  { agente: 'content-creator', rol: 'miembro', especialidad: 'texto', sabe_hacer: ['titulares', 'pie'], necesita: ['manual'], entrega: ['texto'], pertinente_en: ['carrusel', 'kit'], activo: true, version: 1 },
  { agente: 'carousel-designer', rol: 'miembro', especialidad: 'ritmo de láminas', sabe_hacer: ['láminas'], necesita: ['texto'], entrega: ['láminas'], pertinente_en: ['carrusel'], activo: true, version: 1 },
  { agente: 'design-visual-storyteller', rol: 'miembro', especialidad: 'narrativa del kit', sabe_hacer: ['estructura'], necesita: ['brief'], entrega: ['estructura'], pertinente_en: ['kit'], activo: true, version: 1 },
  { agente: 'marketing_instagram_curator', rol: 'miembro', especialidad: 'curaduría visual', sabe_hacer: ['fotos'], necesita: ['fotos'], entrega: ['dirección visual'], pertinente_en: ['carrusel', 'kit'], activo: true, version: 1 },
  { agente: 'design-image-prompt-engineer', rol: 'miembro', especialidad: 'prompts de imagen', sabe_hacer: ['prompts'], necesita: ['dirección visual'], entrega: ['prompts'], pertinente_en: ['carrusel:si_imagen_generada', 'kit:si_imagen_generada'], activo: true, version: 1 },
  { agente: 'portero', rol: 'portero', especialidad: 'material del cerebro', sabe_hacer: ['buscar hechos'], necesita: [], entrega: ['hechos'], pertinente_en: [], activo: true, version: 1 },
]

export interface MesaEnMemoria extends PuertoMesa { filas: Aporte[]; directorioVivo: Tarjeta[] }

export function crearMesaEnMemoria(directorio: Tarjeta[] = DIRECTORIO): MesaEnMemoria {
  const m: MesaEnMemoria = {
    filas: [], directorioVivo: directorio,
    directorio: async () => JSON.parse(JSON.stringify(m.directorioVivo.filter((t) => t.activo))),
    libro: async (encargoId) => m.filas.filter((a) => a.encargo_id === encargoId).sort((a, b) => a.n - b.n).map((a) => ({ ...a })),
    aportar: async (a: NuevoAporte) => {
      const n = m.filas.filter((x) => x.encargo_id === a.encargo_id).length + 1
      const fila: Aporte = { ...a, id: `a-${a.encargo_id.slice(-4)}-${n}`, n, creado_en: '2026-10-28T12:00:00Z' }
      m.filas.push(fila)
      return { ok: true, aporte: fila }
    },
  }
  return m
}
