/**
 * El render de video (S2-5 · CC2): baja los archivos a una carpeta propia del trabajo, escribe la composición como index.html
 * (con la CSP del servicio), corre hyperframes (versión fija del package.json) y devuelve el MP4. La carpeta se borra siempre.
 */
import { spawn } from 'node:child_process'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { argumentosDelRender, conCsp, CSP_VIDEO, entornoDeHyperframes, LIMITES, type PedidoVideo } from './logica'

const require = createRequire(import.meta.url)

/** baja un archivo sin seguir redirecciones (no se puede saltar a un host fuera de la lista) y con tope de tamaño */
async function bajar(url: string, destino: string): Promise<void> {
  const r = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(120_000) })
  if (!r.ok || !r.body) throw new Error(`no se pudo bajar un archivo (${r.status})`)
  const largo = Number(r.headers.get('content-length') ?? 0)
  if (largo > LIMITES.archivo_max_bytes) throw new Error(`archivo de más de ${LIMITES.archivo_max_bytes} bytes`)
  const partes: Buffer[] = []
  let total = 0
  for await (const trozo of r.body as unknown as AsyncIterable<Uint8Array>) {
    total += trozo.length
    if (total > LIMITES.archivo_max_bytes) throw new Error(`archivo de más de ${LIMITES.archivo_max_bytes} bytes`)
    partes.push(Buffer.from(trozo))
  }
  await writeFile(destino, Buffer.concat(partes))
}

/** corre el CLI de hyperframes en la carpeta del trabajo; un render que pasa del tope se corta */
function correrHyperframes(carpeta: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  // el paquete solo exporta ./api y ./package.json: el CLI se ubica desde su package.json (la versión fija instalada)
  const cli = join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs')
  return new Promise((ok, mal) => {
    const hijo = spawn(process.execPath, [cli, ...args], { cwd: carpeta, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let cola = ''
    const guardar = (d: Buffer) => { cola = (cola + d.toString('utf8')).slice(-4000) }
    hijo.stdout.on('data', guardar)
    hijo.stderr.on('data', guardar)
    const reloj = setTimeout(() => { hijo.kill('SIGKILL'); mal(new Error(`el render pasó de ${LIMITES.render_max_ms / 60000} min y se cortó`)) }, LIMITES.render_max_ms)
    hijo.on('error', (e) => { clearTimeout(reloj); mal(e) })
    hijo.on('close', (codigo) => {
      clearTimeout(reloj)
      if (codigo === 0) ok()
      else mal(new Error(`hyperframes terminó con código ${codigo}: ${cola.replace(/\s+/g, ' ').trim().slice(-1500)}`))
    })
  })
}

export async function renderVideo(p: PedidoVideo, id: string): Promise<Buffer> {
  const carpeta = join(tmpdir(), 'render-html', id)
  await mkdir(carpeta, { recursive: true })
  try {
    for (const a of p.archivos) await bajar(a.url, join(carpeta, a.nombre))
    await writeFile(join(carpeta, 'index.html'), conCsp(p.html, CSP_VIDEO), 'utf8')
    const env = entornoDeHyperframes(process.env, {
      navegador: process.env.CHROME_PATH || undefined,
      ffmpeg: process.env.FFMPEG_PATH || undefined,
      ffprobe: process.env.FFPROBE_PATH || undefined,
      config: join(tmpdir(), 'render-html-config'),
    })
    await correrHyperframes(carpeta, argumentosDelRender(p, 'salida.mp4', Number(process.env.RENDER_WORKERS ?? 1)), env)
    return await readFile(join(carpeta, 'salida.mp4'))
  } finally {
    await rm(carpeta, { recursive: true, force: true }).catch(() => undefined)
  }
}
