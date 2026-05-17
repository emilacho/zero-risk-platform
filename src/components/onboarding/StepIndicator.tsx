'use client'

interface Step {
  readonly id: number
  readonly name: string
}

interface StepIndicatorProps {
  steps: readonly Step[]
  currentStep: number
  onStepClick: (step: 1 | 2 | 3 | 4 | 5) => void
}

export default function StepIndicator({ steps, currentStep, onStepClick }: StepIndicatorProps) {
  return (
    <nav aria-label="Progress" className="mb-2">
      <ol role="list" className="flex items-center gap-2 sm:gap-4">
        {steps.map((step, idx) => {
          const isComplete = step.id < currentStep
          const isActive = step.id === currentStep
          const isFuture = step.id > currentStep
          const dotBg = isComplete ? '#3D2466' : isActive ? '#4DD4D8' : '#E2E8F0'
          const ringBg = isActive ? '#3D2466' : 'transparent'
          const textColor = isActive ? '#3D2466' : isComplete ? '#475569' : '#94A3B8'

          return (
            <li key={step.id} className="flex flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => onStepClick(step.id as 1 | 2 | 3 | 4 | 5)}
                disabled={isFuture && step.id !== currentStep}
                className="group flex items-center gap-3 disabled:cursor-not-allowed"
              >
                <span
                  className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ring-2 transition-all"
                  style={{
                    backgroundColor: dotBg,
                    color: isFuture ? '#64748B' : '#FFFFFF',
                    boxShadow: isActive ? `0 0 0 4px ${ringBg}22` : 'none',
                  }}
                >
                  {isComplete ? '✓' : step.id}
                </span>
                <span className="hidden text-sm font-semibold sm:inline" style={{ color: textColor }}>
                  {step.name}
                </span>
              </button>
              {idx < steps.length - 1 && (
                <span
                  className="hidden h-px flex-1 sm:block"
                  style={{ backgroundColor: step.id < currentStep ? '#3D2466' : '#E2E8F0' }}
                  aria-hidden="true"
                />
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
