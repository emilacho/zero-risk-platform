/**
 * 19-nov · CC5 · G9 (GO Lenovo 07:59Z · opción A 08:15Z): la alarma del CI contra recortes nuevos.
 *   · un corte nuevo (slice/substring/substr/truncar/recortar) sin marca con razón y firma rompe el CI
 *   · un corte que toca lo que lee un agente, un documento o la base lleva además el papel y «autoriza Lenovo|Emilio»
 *   · la lista de lo que ya existía (scripts/cortes/cortes-existentes.json) solo se achica, frente a la base de la revisión
 *   · lo vivo a propósito (topes de gasto de Apify, el «hasta 120 s» del video) sigue donde la lista dice
 * La regla exacta vive en scripts/cortes/detector.mjs. Sin red, US$ 0.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import * as D from "../scripts/cortes/detector.mjs"

type Corte = { archivo: string; n: number; linea: string; patrones: string[]; marca: null | Record<string, string | null> }
type Entrada = { archivo: string; huella: string; n?: number; veces: number; clase: string }
type Lista = { cortes: Entrada[]; vivos_a_proposito: Array<{ archivo: string; texto: string; razon: string; papel: string; autoriza: string }> }

const RAIZ = path.resolve(__dirname, "..")
const RUTA_LISTA = "scripts/cortes/cortes-existentes.json"
const lista: Lista = JSON.parse(readFileSync(path.join(RAIZ, RUTA_LISTA), "utf8"))

/** La lista de la base: en el CI, el padre del commit de la revisión (en una revisión, el padre 1 de la unión es main); a mano, origin/main.
 *  El CI baja un solo commit: si el padre no está, se pide con `git fetch --depth=2` de ese commit (sin tocar ci.yml). */
function listaDeLaBase(): { lista: Lista | null; base: string; motivo: string } {
  const base = process.env.CORTES_BASE ?? (process.env.GITHUB_ACTIONS ? "HEAD^1" : "origin/main")
  const git = (...a: string[]) => execFileSync("git", a, { cwd: RAIZ, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"] })
  const hay = () => {
    try {
      git("cat-file", "-e", `${base}^{commit}`)
      return true
    } catch {
      return false
    }
  }
  if (!hay() && process.env.GITHUB_ACTIONS && process.env.GITHUB_SHA && base === "HEAD^1") {
    try {
      git("fetch", "--no-tags", "--depth=2", "origin", process.env.GITHUB_SHA)
    } catch {
      /* si no se puede, queda «sin_historia» y la prueba lo dice */
    }
  }
  if (!hay()) return { lista: null, base, motivo: "sin_historia" }
  try {
    return { lista: JSON.parse(git("show", `${base}:${RUTA_LISTA}`)), base, motivo: "ok" }
  } catch {
    return { lista: null, base, motivo: "la_base_no_tiene_lista" }
  }
}

const donde = (c: { archivo: string; n?: number; linea: string }) => `  ${c.archivo}${c.n ? `:${c.n}` : ""}  ${c.linea.slice(0, 160)}`

describe("G9 · la alarma contra recortes nuevos (el código de verdad)", () => {
  const cortes: Corte[] = D.todosLosCortes(RAIZ)
  const base = listaDeLaBase()
  const r = D.revisar({ cortes, lista, listaBase: base.lista })

  it("ningún corte nuevo sin su marca", () => {
    const msg = r.nuevos.length ? `\n${r.nuevos.length} corte(s) nuevo(s) sin marca:\n${r.nuevos.slice(0, 40).map(donde).join("\n")}\n\n${D.MENSAJE}\n` : ""
    expect(msg).toBe("")
  })

  it("las marcas están bien escritas (razón, firma y, si toca lo que se lee, papel y quién autoriza)", () => {
    const msg = r.marcasMalas.map((c: Corte & { problemas: string[] }) => `${donde(c)}\n    → ${c.problemas.join("\n    → ")}`).join("\n")
    expect(msg ? `\n${msg}\n\n${D.MENSAJE}\n` : "").toBe("")
  })

  it("la lista no guarda cortes que ya no están en el código (si arreglaste uno, sácalo de la lista)", () => {
    const msg = r.sobranEnLista.map((s: { archivo: string; linea: string; veces: number; hay: number }) => `${donde(s)}\n    → la lista dice ${s.veces}, en el código hay ${s.hay} sin marca: baja «veces» o borra la entrada`).join("\n")
    expect(msg ? `\n${msg}\n` : "").toBe("")
  })

  it("cada entrada de la lista tiene una de las 4 clases", () => {
    expect(r.clasesMalas.map((c: Entrada) => `${c.archivo}:${c.n} [${c.clase}]`)).toEqual([])
  })

  it("la lista guarda huellas, no texto de código (no copia nombres de tablas ni nada que otras guardas vigilen)", () => {
    for (const c of lista.cortes) {
      expect(Object.keys(c).sort(), c.archivo).toEqual(["archivo", "clase", "huella", "n", "veces"])
      expect(c.huella, c.archivo).toMatch(/^[0-9a-f]{16}$/)
    }
  })

  it("la lista solo se achica frente a la base (nadie agrega, tampoco a por-revisar-en-G8)", () => {
    if (base.motivo === "sin_historia") {
      // en el CI la historia tiene que estar (la prueba la pide con git fetch): sin ella esta guarda no protegería nada
      expect(process.env.GITHUB_ACTIONS ? `el CI no pudo traer el commit base ${base.base} (ni con git fetch --depth=2): sin él esta guarda no protege` : "").toBe("")
      return
    }
    const msg = r.creceLaLista
      .map((c: { archivo: string; linea: string; clase: string; antes: number; ahora: number }) => `${donde(c)}\n    → [${c.clase}] antes ${c.antes}, ahora ${c.ahora}: un corte nuevo no entra a la lista, lleva su marca en el código`)
      .join("\n")
    expect(msg ? `\n${msg}\n\n${D.MENSAJE}\n` : "").toBe("")
  })

  it("lo vivo a propósito sigue donde la lista dice, con su razón y quién lo autorizó", () => {
    expect(lista.vivos_a_proposito.length).toBeGreaterThan(0)
    for (const v of lista.vivos_a_proposito) {
      const ruta = path.join(RAIZ, v.archivo)
      expect(existsSync(ruta), v.archivo).toBe(true)
      expect(readFileSync(ruta, "utf8").includes(v.texto), `${v.archivo}: «${v.texto}»`).toBe(true)
      expect(v.razon.trim().length, v.archivo).toBeGreaterThan(0)
      expect(v.papel, v.archivo).toMatch(/^raw\/\S+\.md$/)
      expect(v.autoriza, v.archivo).toMatch(/^(Lenovo|Emilio)$/)
    }
  })
})

describe("G9 · el detector (casos chicos)", () => {
  const de = (texto: string, archivo = "src/x.ts") => D.cortesDelArchivo(archivo, texto) as Corte[]
  const vacia: Lista = { cortes: [], vivos_a_proposito: [] }

  it("encuentra los cinco tipos de corte", () => {
    const t = ["a.slice(0, 300)", "a.slice(-5)", "a.substring(0, n)", "a.substr(2, 3)", "truncar(a, 10)", "recortarTexto(a)", "truncate(a)"].join("\n")
    expect(de(t).map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it("no confunde lo que no corta: Math.trunc, slice(1), slice() y los comentarios", () => {
    expect(de(["Math.trunc(x)", "a.slice(1)", "a.slice()", "// a.slice(0, 3)", " * a.substring(0, 2)"].join("\n"))).toEqual([])
  })

  it("un corte nuevo sin marca sale en «nuevos»", () => {
    expect(D.revisar({ cortes: de("x = a.slice(0, 300)"), lista: vacia, listaBase: null }).nuevos).toHaveLength(1)
  })

  it("la marca vale en la misma línea o en la de arriba, no dos más arriba", () => {
    const misma = de("x = a.slice(0, 300) // corte: el asunto del correo tiene 300 como máximo · firma CC5 2026-11-19")
    const arriba = de("// corte: el asunto del correo tiene 300 como máximo · firma CC5 2026-11-19\nx = a.slice(0, 300)")
    const lejos = de("// corte: el asunto del correo tiene 300 como máximo · firma CC5 2026-11-19\n\nx = a.slice(0, 300)")
    for (const c of [misma, arriba]) expect(D.revisar({ cortes: c, lista: vacia, listaBase: null })).toMatchObject({ nuevos: [], marcasMalas: [] })
    expect(D.revisar({ cortes: lejos, lista: vacia, listaBase: null }).nuevos).toHaveLength(1)
  })

  it("una marca sin razón o sin firma no vale", () => {
    const sinRazon = de("x = a.slice(0, 3) // corte: · firma CC5 2026-11-19")
    const sinFirma = de("x = a.slice(0, 3) // corte: el código postal tiene 3 dígitos")
    const sinFecha = de("x = a.slice(0, 3) // corte: el código postal tiene 3 dígitos · firma CC5")
    for (const c of [sinRazon, sinFirma, sinFecha]) expect(D.revisar({ cortes: c, lista: vacia, listaBase: null }).marcasMalas).toHaveLength(1)
  })

  // 19-nov · 🟡 de CC6 (k1, k2, k3, k4, k9): la forma exacta de la marca, fijada caso por caso
  it("k1 · la marca de arriba vale solo si esa línea es un comentario: un corte marcado al final de una línea no tapa el de la siguiente", () => {
    const c = de("x = a.slice(0, 3) // corte: el código postal tiene 3 dígitos · firma CC5 2026-11-19\ny = b.slice(0, 300)")
    const r = D.revisar({ cortes: c, lista: vacia, listaBase: null })
    expect(r.nuevos.map((x: Corte) => x.n)).toEqual([2])
  })

  it("k2 · un tipo inventado no vale", () => {
    const [c] = de("x = a.slice(0, 3) // corte (otro): el código postal tiene 3 dígitos · firma CC5 2026-11-19")
    expect(D.problemasDeLaMarca(c.marca)).toEqual(["el tipo «otro» no existe: usa «corte:» o «corte (lectura):»"])
  })

  it("k3 · el papel de un corte de lectura es una ruta raw/….md, no cualquier archivo", () => {
    const [c] = de("x = manual.slice(0, 9000) // corte (lectura): el proveedor acepta 9000 · firma CC5 2026-11-19 · papel notas.txt · autoriza Lenovo")
    expect(D.problemasDeLaMarca(c.marca)).toEqual(["un corte de lectura nombra el papel donde se firmó: «· papel raw/<…>.md»"])
  })

  it("k4 · «autoriza» es exactamente Lenovo o Emilio, no algo que empiece así", () => {
    for (const quien of ["Lenovo-CC5", "LenovoX", "EmilioCC5"]) {
      const [c] = de(`x = manual.slice(0, 9000) // corte (lectura): el proveedor acepta 9000 · firma CC5 2026-11-19 · papel raw/tasks/2026-11-19-x.md · autoriza ${quien}`)
      expect(D.problemasDeLaMarca(c.marca), quien).toEqual(["un corte de lectura lo autoriza Lenovo, o Emilio si es su documento: «· autoriza Lenovo»"])
    }
  })

  it("k9 · la firma lleva una fecha AAAA-MM-DD, no cualquier palabra", () => {
    for (const f of ["CC5 hoy", "CC5 19-11-2026", "CC5 2026-11-19x"]) {
      const [c] = de(`x = a.slice(0, 3) // corte: el código postal tiene 3 dígitos · firma ${f}`)
      expect(D.problemasDeLaMarca(c.marca), f).toEqual(["falta la firma: «· firma <quién> <AAAA-MM-DD>»"])
    }
  })

  it("una razón vacía o de relleno no vale aunque la firma esté bien (y el aviso dice que falta la razón)", () => {
    for (const r of ["", "todo", "...", "<razón>"]) {
      const [c] = de(`x = a.slice(0, 3) // corte: ${r} · firma CC5 2026-11-19`)
      expect(D.problemasDeLaMarca(c.marca), r).toEqual(["falta la razón: escribe por qué este corte tiene que existir"])
    }
  })

  it("un corte de lectura pide el papel y que lo autorice Lenovo o Emilio", () => {
    const bien = de("x = manual.slice(0, 9000) // corte (lectura): el proveedor acepta 9000 · firma CC5 2026-11-19 · papel raw/tasks/2026-11-19-x.md · autoriza Lenovo")
    const sinPapel = de("x = manual.slice(0, 9000) // corte (lectura): el proveedor acepta 9000 · firma CC5 2026-11-19 · autoriza Lenovo")
    const otroAutoriza = de("x = manual.slice(0, 9000) // corte (lectura): el proveedor acepta 9000 · firma CC5 2026-11-19 · papel raw/tasks/2026-11-19-x.md · autoriza CC5")
    expect(D.revisar({ cortes: bien, lista: vacia, listaBase: null }).marcasMalas).toEqual([])
    expect(D.revisar({ cortes: sinPapel, lista: vacia, listaBase: null }).marcasMalas).toHaveLength(1)
    expect(D.revisar({ cortes: otroAutoriza, lista: vacia, listaBase: null }).marcasMalas).toHaveLength(1)
  })

  it("la lista cubre las veces que dice, ni una más", () => {
    const dos = de("a.slice(0, 3)\na.slice(0, 3)")
    const una: Lista = { cortes: [{ archivo: "src/x.ts", huella: D.huella("a.slice(0, 3)"), veces: 1, clase: "registro" }], vivos_a_proposito: [] }
    expect(D.revisar({ cortes: dos, lista: una, listaBase: null }).nuevos).toHaveLength(1)
  })

  it("una entrada que ya no está en el código sale en «sobranEnLista»", () => {
    const una: Lista = { cortes: [{ archivo: "src/x.ts", huella: D.huella("a.slice(0, 3)"), veces: 1, clase: "registro" }], vivos_a_proposito: [] }
    expect(D.revisar({ cortes: [], lista: una, listaBase: null }).sobranEnLista).toHaveLength(1)
  })

  it("la lista no puede crecer frente a la base, tampoco pasando un corte de una clase a otra", () => {
    const base: Lista = { cortes: [{ archivo: "src/x.ts", huella: D.huella("a.slice(0, 3)"), veces: 1, clase: "registro" }], vivos_a_proposito: [] }
    const crece: Lista = { cortes: [{ archivo: "src/x.ts", huella: D.huella("a.slice(0, 3)"), veces: 2, clase: "registro" }], vivos_a_proposito: [] }
    const cambia: Lista = { cortes: [{ archivo: "src/x.ts", huella: D.huella("a.slice(0, 3)"), veces: 1, clase: "por-revisar-en-G8" }], vivos_a_proposito: [] }
    const achica: Lista = { cortes: [], vivos_a_proposito: [] }
    expect(D.revisar({ cortes: [], lista: crece, listaBase: base }).creceLaLista).toHaveLength(1)
    expect(D.revisar({ cortes: [], lista: cambia, listaBase: base }).creceLaLista).toHaveLength(1)
    expect(D.revisar({ cortes: [], lista: achica, listaBase: base }).creceLaLista).toEqual([])
  })

  it("no mira pruebas, migraciones ni documentos", () => {
    for (const a of ["__tests__/a.ts", "src/a.test.ts", "supabase/migrations/a.ts", "docs/a.mjs", "packages/p/test/a.ts"]) expect(D.excluida(a), a).toBe(true)
    for (const a of ["src/lib/a.ts", "services/agent-runner/src/a.ts", "scripts/ops/a.mjs"]) expect(D.excluida(a), a).toBe(false)
  })

  it("el mensaje dice qué hacer en palabras simples", () => {
    expect(D.MENSAJE).toMatch(/^No cortes\. Si de verdad hace falta, márcalo con su razón y su firma/)
  })
})
