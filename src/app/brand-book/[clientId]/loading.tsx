export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl animate-pulse px-4 py-8">
      <div className="border-b border-gray-200 pb-6">
        <div className="h-8 w-1/2 rounded bg-gray-200" />
        <div className="mt-2 h-4 w-1/3 rounded bg-gray-100" />
      </div>
      <div className="mt-6 flex gap-2 border-b border-gray-200 pb-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-8 w-24 rounded bg-gray-100" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        <div className="h-20 rounded bg-gray-100" />
        <div className="h-20 rounded bg-gray-100" />
        <div className="h-20 rounded bg-gray-100" />
      </div>
    </div>
  )
}
