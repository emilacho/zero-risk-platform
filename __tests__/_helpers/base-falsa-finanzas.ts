// Base falsa en memoria para las rutas de la oficina financiera (copiada de finanzas-seco-oficina.test.ts · CC#2) · solo pruebas.
/* eslint-disable @typescript-eslint/no-explicit-any */
export
 function baseFalsa(config: Record<string, unknown>) {
  const t: Record<string, any[]> = { finanzas_config: [{ id: 1, ...config }], finanzas_encargos: [], finanzas_turnos: [], finanzas_artefactos: [] }
  let id = 0
  const from = (tabla: string) => {
    const q: any = { op: 'select', filtros: [] as Array<(f: any) => boolean>, orden: null, lim: Infinity, fila: null, conflicto: null }
    const ejecutar = () => {
      // el libro de costos (`agent_invocations`) se LEE vacío y NO se registra como tabla escrita (el seco no gasta)
      const filas = t[tabla] ?? (tabla === 'agent_invocations' ? [] : t[tabla])
      const sel = filas.filter((f) => q.filtros.every((fn: any) => fn(f)))
      if (q.op === 'insert') {
        if (tabla === 'finanzas_encargos' && filas.some((f) => f.client_id === q.fila.client_id && ['abierto', 'en_curso'].includes(f.estado))) return { data: null, error: { message: 'duplicate key', code: '23505' } }
        const nueva = { id: `f-${++id}`, ...structuredClone(q.fila) }
        filas.push(nueva)
        return { data: structuredClone(nueva), error: null }
      }
      if (q.op === 'upsert') {
        const claves = String(q.conflicto).split(',')
        const ya = filas.find((f) => claves.every((k) => f[k] === q.fila[k]))
        if (ya) Object.assign(ya, structuredClone(q.fila)); else filas.push({ id: `f-${++id}`, ...structuredClone(q.fila) })
        return { data: null, error: null }
      }
      if (q.op === 'update') { sel.forEach((f) => Object.assign(f, structuredClone(q.fila))); return { data: null, error: null } }
      let r = sel.map((f) => structuredClone(f))
      if (q.orden) r = r.sort((a, b) => (a[q.orden[0]] > b[q.orden[0]] ? 1 : -1) * (q.orden[1] ? 1 : -1))
      return { data: r.slice(0, q.lim), error: null }
    }
    const api: any = {
      select: () => api,
      insert: (f: any) => { q.op = 'insert'; q.fila = f; return api },
      update: (f: any) => { q.op = 'update'; q.fila = f; return api },
      upsert: (f: any, o: any) => { q.op = 'upsert'; q.fila = f; q.conflicto = o?.onConflict; return api },
      eq: (k: string, v: unknown) => { q.filtros.push((f: any) => f[k] === v); return api },
      like: (k: string, v: string) => { const pre = v.replace(/%$/, ''); q.filtros.push((f: any) => String(f[k] ?? '').startsWith(pre)); return api },
      in: (k: string, v: unknown[]) => { q.filtros.push((f: any) => v.includes(f[k])); return api },
      order: (k: string, o: any) => { q.orden = [k, o?.ascending !== false]; return api },
      limit: (n: number) => { q.lim = n; return api },
      maybeSingle: async () => { const r = ejecutar(); return { data: (r.data as any[] | null)?.[0] ?? null, error: r.error } },
      single: async () => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error } },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from } as any, t }
}
