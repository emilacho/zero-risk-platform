/** La oficina nombra sus propias tablas (guarda): la sala del director solo pide su interruptor. Solo lectura. */
export const consultaEstadoDeLaOficina = (db: { from(tabla: string): any }) => db.from('oficina_config').select('estado').eq('id', 1).limit(1)
