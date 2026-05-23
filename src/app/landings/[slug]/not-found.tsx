export default function LandingNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6 py-24">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-zinc-500">404</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl">
          Landing no disponible
        </h1>
        <p className="mt-4 text-base text-zinc-600">
          Esta página no existe o está desactivada.
        </p>
        <a
          href="/"
          className="mt-8 inline-flex items-center justify-center rounded-full bg-zinc-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-zinc-700"
        >
          Volver al inicio
        </a>
      </div>
    </main>
  )
}
