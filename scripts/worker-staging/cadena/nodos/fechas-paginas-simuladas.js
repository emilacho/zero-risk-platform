// ② PÁGINAS SIMULADAS · SOLO en seco: las páginas enlatadas del ensayo (cero descargas)
const s = $input.first().json
const sim = s.simulacro || {}
return [{ json: { ...s, paginas: Array.isArray(sim.paginas) ? sim.paginas : [] } }]
