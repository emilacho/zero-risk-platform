import Link from 'next/link'

const services = [
  {
    icon: '🛡️',
    title: 'Equipos de Protección Personal',
    description: 'Cascos, guantes, gafas, arneses y más. Certificaciones internacionales.',
  },
  {
    icon: '🔥',
    title: 'Protección Contra Incendios',
    description: 'Extintores, detectores de humo, rociadores y sistemas de alarma.',
  },
  {
    icon: '⚠️',
    title: 'Señalización Industrial',
    description: 'Señales de seguridad, cintas de peligro, conos y barreras.',
  },
  {
    icon: '📋',
    title: 'Capacitación',
    description: 'Cursos de seguridad industrial, primeros auxilios y manejo de emergencias.',
  },
  {
    icon: '🏭',
    title: 'Auditorías de Seguridad',
    description: 'Evaluación de riesgos, planes de emergencia y cumplimiento normativo.',
  },
  {
    icon: '🚑',
    title: 'Kits de Emergencia',
    description: 'Botiquines, camillas, duchas de emergencia y lavaojos.',
  },
]

const stats = [
  { value: '500+', label: 'Empresas Protegidas' },
  { value: '15+', label: 'Años de Experiencia' },
  { value: '99.8%', label: 'Satisfacción del Cliente' },
  { value: '24/7', label: 'Soporte Disponible' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="fixed top-0 z-50 w-full border-b border-gray-100 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zero-risk-highlight text-white font-bold text-sm">
              ZR
            </div>
            <span className="text-lg font-bold text-gray-900">Zero Risk</span>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <a href="#servicios" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Servicios</a>
            <a href="#nosotros" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Nosotros</a>
            <a href="#contacto" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Contacto</a>
          </div>
          <Link
            href="/dashboard"
            className="rounded-lg bg-zero-risk-primary px-4 py-2 text-sm font-medium text-white hover:bg-zero-risk-secondary transition-colors"
          >
            Panel de Control
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden pt-16">
        <div className="absolute inset-0 bg-gradient-to-br from-zero-risk-primary via-zero-risk-secondary to-zero-risk-accent" />
        <div className="relative mx-auto max-w-7xl px-6 py-24 sm:py-32 lg:py-40">
          <div className="max-w-2xl">
            <div className="mb-6 inline-flex items-center rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white">
              Seguridad Industrial en Ecuador
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Protege a tu equipo con{' '}
              <span className="text-zero-risk-highlight">cero riesgo</span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-gray-300">
              Somos líderes en equipos de protección personal y seguridad industrial.
              Más de 15 años garantizando la seguridad de trabajadores en Ecuador.
            </p>
            <div className="mt-10 flex items-center gap-4">
              <a
                href="#contacto"
                className="rounded-lg bg-zero-risk-highlight px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-600 transition-colors"
              >
                Solicitar Cotización
              </a>
              <a
                href="#servicios"
                className="rounded-lg border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition-colors"
              >
                Ver Servicios
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-b border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-zero-risk-primary">{stat.value}</p>
                <p className="mt-1 text-sm text-gray-500">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Services */}
      <section id="servicios" className="scroll-mt-16">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-gray-900">Nuestros Servicios</h2>
            <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
              Soluciones integrales de seguridad industrial para empresas de todos los tamaños
            </p>
          </div>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div
                key={service.title}
                className="group rounded-2xl border border-gray-200 p-8 hover:border-zero-risk-highlight hover:shadow-lg transition-all"
              >
                <span className="text-4xl">{service.icon}</span>
                <h3 className="mt-4 text-lg font-semibold text-gray-900 group-hover:text-zero-risk-highlight transition-colors">
                  {service.title}
                </h3>
                <p className="mt-2 text-sm text-gray-500 leading-relaxed">{service.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* About */}
      <section id="nosotros" className="scroll-mt-16 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-2 items-center">
            <div>
              <h2 className="text-3xl font-bold text-gray-900">¿Por qué Zero Risk?</h2>
              <p className="mt-6 text-gray-600 leading-relaxed">
                Con más de 15 años en el mercado ecuatoriano, Zero Risk se ha consolidado
                como referente en seguridad industrial. Nuestro compromiso es garantizar que
                cada trabajador regrese a casa sano y salvo.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  'Productos certificados internacionalmente',
                  'Asesoría técnica personalizada',
                  'Entrega rápida a nivel nacional',
                  'Precios competitivos sin comprometer calidad',
                ].map((item) => (
                  <li key={item} className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-green-600 text-xs">✓</span>
                    <span className="text-sm text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl bg-gradient-to-br from-zero-risk-primary to-zero-risk-accent p-12 text-center text-white">
              <p className="text-5xl font-bold">15+</p>
              <p className="mt-2 text-lg">Años de experiencia</p>
              <div className="mt-8 h-px bg-white/20" />
              <p className="mt-8 text-5xl font-bold">500+</p>
              <p className="mt-2 text-lg">Empresas confían en nosotros</p>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section id="contacto" className="scroll-mt-16">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900">Solicita tu Cotización</h2>
            <p className="mt-4 text-gray-500">
              Completa el formulario y nos pondremos en contacto en menos de 24 horas
            </p>
          </div>
          <div className="mx-auto max-w-xl">
            <form className="space-y-6" action="/api/leads" method="POST">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nombre completo</label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-zero-risk-highlight focus:ring-1 focus:ring-zero-risk-highlight focus:outline-none"
                    placeholder="Tu nombre"
                  />
                </div>
                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700">Teléfono</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-zero-risk-highlight focus:ring-1 focus:ring-zero-risk-highlight focus:outline-none"
                    placeholder="+593 9XX XXX XXXX"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-zero-risk-highlight focus:ring-1 focus:ring-zero-risk-highlight focus:outline-none"
                  placeholder="tu@empresa.com"
                />
              </div>
              <div>
                <label htmlFor="notes" className="block text-sm font-medium text-gray-700">¿Qué necesitas?</label>
                <textarea
                  id="notes"
                  name="notes"
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-sm focus:border-zero-risk-highlight focus:ring-1 focus:ring-zero-risk-highlight focus:outline-none resize-none"
                  placeholder="Describe los productos o servicios que necesitas..."
                />
              </div>
              <button
                type="submit"
                className="w-full rounded-lg bg-zero-risk-highlight px-6 py-3.5 text-sm font-semibold text-white shadow-lg hover:bg-red-600 transition-colors"
              >
                Enviar Solicitud
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-zero-risk-primary">
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zero-risk-highlight text-white font-bold text-sm">
                ZR
              </div>
              <span className="text-sm font-bold text-white">Zero Risk Ecuador</span>
            </div>
            <p className="text-xs text-gray-400">
              © {new Date().getFullYear()} Zero Risk. Todos los derechos reservados.
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}
