/** La lectura real de la base para las rutas del portero: la llave de servicio del servidor, y solo GET (ver consulta.ts). */
import { type Consulta, crearConsultaRest } from '../consulta'

export function consultaDelEntorno(): Consulta {
  return crearConsultaRest({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
    llave: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  })
}
