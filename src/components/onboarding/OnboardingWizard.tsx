'use client'

import { useState, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { INITIAL_WIZARD_STATE, type OnboardingWizardState } from '@/lib/onboarding-schema'
import Step1ClientInfo from './steps/Step1ClientInfo'
import Step2BrandDiscovery from './steps/Step2BrandDiscovery'
import Step3UploadAssets from './steps/Step3UploadAssets'
import Step4TriggerCascade from './steps/Step4TriggerCascade'
import Step5Review from './steps/Step5Review'
import StepIndicator from './StepIndicator'
import CoworkContextChat from '@/components/cowork/CoworkContextChat'

const STEPS = [
  { id: 1, name: 'Cliente' },
  { id: 2, name: 'Brand discovery' },
  { id: 3, name: 'Assets' },
  { id: 4, name: 'Cascade' },
  { id: 5, name: 'Review' },
] as const

const TRANSITION = { type: 'tween' as const, duration: 0.3, ease: [0.16, 1, 0.3, 1] }

export default function OnboardingWizard() {
  const [state, setState] = useState<OnboardingWizardState>(INITIAL_WIZARD_STATE)
  const [direction, setDirection] = useState<1 | -1>(1)

  const updateState = useCallback(<K extends keyof OnboardingWizardState>(key: K, patch: Partial<OnboardingWizardState[K]>) => {
    setState(prev => ({ ...prev, [key]: { ...(prev[key] as object), ...(patch as object) } } as OnboardingWizardState))
  }, [])

  const goToStep = useCallback((step: OnboardingWizardState['current_step']) => {
    setDirection(step > state.current_step ? 1 : -1)
    setState(prev => ({ ...prev, current_step: step }))
  }, [state.current_step])

  const nextStep = useCallback(() => {
    if (state.current_step < 5) {
      setDirection(1)
      setState(prev => ({ ...prev, current_step: (prev.current_step + 1) as OnboardingWizardState['current_step'] }))
    }
  }, [state.current_step])

  const prevStep = useCallback(() => {
    if (state.current_step > 1) {
      setDirection(-1)
      setState(prev => ({ ...prev, current_step: (prev.current_step - 1) as OnboardingWizardState['current_step'] }))
    }
  }, [state.current_step])

  const setSessionId = useCallback((id: string) => {
    setState(prev => ({ ...prev, onboarding_session_id: id }))
  }, [])

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <header className="mb-10 max-w-3xl">
        <p className="text-sm font-medium uppercase tracking-wider" style={{ color: '#3D2466' }}>
          Onboarding cliente nuevo
        </p>
        <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
          Iniciar cliente
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          5 pasos · brand discovery → assets → cascade → review. Cowork acompaña cada paso con guía contextual.
        </p>
      </header>

      <StepIndicator steps={STEPS} currentStep={state.current_step} onStepClick={goToStep} />

      <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1fr,380px]">
        <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={state.current_step}
              initial={{ opacity: 0, x: direction === 1 ? 24 : -24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction === 1 ? -24 : 24 }}
              transition={TRANSITION}
            >
              {state.current_step === 1 && (
                <Step1ClientInfo
                  data={state.step1}
                  onChange={p => updateState('step1', p)}
                  onNext={nextStep}
                  setSessionId={setSessionId}
                />
              )}
              {state.current_step === 2 && (
                <Step2BrandDiscovery
                  data={state.step2}
                  slug={state.step1.slug}
                  onChange={p => updateState('step2', p)}
                  onNext={nextStep}
                  onPrev={prevStep}
                />
              )}
              {state.current_step === 3 && (
                <Step3UploadAssets
                  data={state.step3}
                  slug={state.step1.slug}
                  onChange={p => updateState('step3', p)}
                  onNext={nextStep}
                  onPrev={prevStep}
                />
              )}
              {state.current_step === 4 && (
                <Step4TriggerCascade
                  data={state.step4}
                  payload={state}
                  onChange={p => updateState('step4', p)}
                  onNext={nextStep}
                  onPrev={prevStep}
                />
              )}
              {state.current_step === 5 && (
                <Step5Review
                  data={state.step5}
                  state={state}
                  onChange={p => updateState('step5', p)}
                  onPrev={prevStep}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </section>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <CoworkContextChat
            context={{
              step: state.current_step,
              step_name: STEPS[state.current_step - 1].name,
              client_name: state.step1.client_name || null,
              slug: state.step1.slug || null,
              industry: state.step1.industry || null,
            }}
          />
        </aside>
      </div>
    </div>
  )
}
