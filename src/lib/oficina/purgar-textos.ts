/** El reloj de la oficina borra los textos de llamadas viejos. Solo esa tabla: el libro de costos no se toca. Nunca lanza. */
import { DIAS_DE_TEXTOS } from '../textos-de-invocacion'

type Db = { from: (t: string) => { delete: () => { lt: (c: string, v: string) => PromiseLike<{ error: { message: string } | null }> } } }
export async function purgarTextosViejos(dbCrudo: unknown, ahora: Date): Promise<{ error: string | null }> {
  try {
    const limite = new Date(ahora.getTime() - DIAS_DE_TEXTOS * 86_400_000).toISOString()
    const { error } = await (dbCrudo as Db).from('agent_invocation_textos').delete().lt('creado_en', limite)
    return { error: error?.message ?? null }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) }
  }
}
