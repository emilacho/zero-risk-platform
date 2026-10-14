/**
 * LAS TRES PLANTILLAS DE PIEZA CON EL PASO `jefatura` (J8a · diseño v4 §11.1 y §13.2) · son DATO, derivadas de las de julio (que no se tocan: la migración las congela y las pruebas del motor las usan):
 * de cada una salen `revision_jefe`, `corrige*`, `ajusta_laminas*`, `revisor_externo`, `decide*` y `decide_imagen`, y en el lugar del jefe queda UN paso `jefatura`.
 * Todo lo demás se conserva: los chequeos duros (`chequeos`, `chequeos_2/3`), la re-imagen (`reimagen_*`), el armado y el dibujo de láminas, la entrega, el cierre y el tope del encargo.
 * Pasar de la plantilla de julio a esta es CAMBIAR UNA FILA de `oficina_tipos_de_grupo` (migración aparte, sin aplicar, con su reversa); el código no lee estas constantes en producción.
 */
import type { Paso, Plantilla } from '../tipos'
import { ARTEFACTO_DE_LA_JEFATURA, CLAVE_DEL_PASO_JEFATURA } from '../paso-jefatura'
import { CARRUSEL_IG_V1 } from './carrusel-ig-v1'
import { KIT_HISTORIAS } from './kit-historias'
import { POST_IMG } from './post-img'

/** los pasos que la jefatura reemplaza (el jefe, quienes corrigen, el revisor externo y quienes deciden) */
export const PASOS_QUE_SE_VAN = [
  'revision_jefe', 'corrige', 'corrige_texto', 'corrige_laminas', 'corrige_estructura', 'ajusta_laminas', 'ajusta_laminas_2',
  'revisor_externo', 'decide', 'decide_texto', 'decide_laminas', 'decide_estructura', 'decide_imagen',
] as const

/** los agentes que ya no son pasos de la plantilla porque su trabajo de revisión ahora es de la jefatura (su indicación como revisor vive en la política de la jefatura) */
const AGENTES_QUE_SE_VAN = ['jefe-marketing']

export function conJefatura(base: Plantilla): Plantilla {
  const i = base.pasos.findIndex((p) => p.clave === 'revision_jefe')
  if (i < 0) throw new Error(`«${base.tipo}» no tiene el paso revision_jefe: no se sabe dónde va la jefatura`)
  const jefe = base.pasos[i]
  const paso: Paso = {
    clave: CLAVE_DEL_PASO_JEFATURA, tipo: 'jefatura', quien: 'jefatura', condicion: { tipo: 'siempre' },
    // lo que el jefe leía; así cada artefacto queda «consumido» y `si_cambio` ve lo que la jefatura corrija
    entrada: jefe.entrada, salida_artefacto: ARTEFACTO_DE_LA_JEFATURA, tope_usd: 0,
  }
  const pasos = base.pasos.flatMap((p, k) => (k === i ? [paso] : (PASOS_QUE_SE_VAN as readonly string[]).includes(p.clave) ? [] : [p]))
  const indicaciones = Object.fromEntries(Object.entries(base.indicaciones).filter(([agente]) => !AGENTES_QUE_SE_VAN.includes(agente)))
  return { ...base, pasos, indicaciones, limites: { ...base.limites } }
}

export const POST_IMG_CON_JEFATURA: Plantilla = conJefatura(POST_IMG)
export const CARRUSEL_IG_CON_JEFATURA: Plantilla = conJefatura(CARRUSEL_IG_V1)
export const KIT_HISTORIAS_CON_JEFATURA: Plantilla = conJefatura(KIT_HISTORIAS)
