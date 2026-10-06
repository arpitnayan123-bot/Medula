'use client'

import { useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  GraduationCap,
  Info,
  Layers,
  ListChecks,
  Loader2,
  Network,
  Palette,
  Route,
  Sparkles,
  Target,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { api } from '@/lib/api'
import { useAppStore } from '@/lib/store'
import { useToast } from '@/hooks/use-toast'
import { LogoMark } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { PREP_STAGE_LABELS, YEAR_LABELS } from '@/lib/types'
import type { Profile } from '@/lib/types'
import { cn } from '@/lib/utils'

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]

// Reduced-motion as post-hydration state → SSR and first client render always match.
function usePrefersReducedMotion() {
  const prefers = useReducedMotion()
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    setReduce(prefers === true)
  }, [prefers])
  return reduce
}

const STEPS = ['Welcome', 'Academic', 'Preparation', 'Time', 'Learning style', 'Resources', 'Review'] as const
const SEMESTERS = Array.from({ length: 8 }, (_, i) => i + 1)

const YEAR_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '1st Year' },
  { value: 2, label: '2nd Year' },
  { value: 3, label: '3rd Year' },
  { value: 4, label: 'Final Year' },
  { value: 5, label: 'Intern' },
  { value: 6, label: 'Dedicated Prep' },
]

const COLLEGE_TYPES = ['Government', 'Private', 'Deemed'] as const
type CollegeType = (typeof COLLEGE_TYPES)[number]

const PREP_OPTIONS: { value: Profile['prepStage']; label: string; desc: string }[] = [
  { value: 'exploring', label: 'Exploring', desc: 'Just getting oriented — seeing what NEET-PG even demands.' },
  { value: 'foundation', label: 'Building foundation', desc: 'Concepts and early-year basics, done properly this time.' },
  { value: 'regular', label: 'Regular preparation', desc: 'Studying consistently alongside college.' },
  { value: 'serious', label: 'Serious preparation', desc: 'Structured prep with question practice every week.' },
  { value: 'dedicated', label: 'Dedicated NEET-PG preparation', desc: 'Full-time prep — college is on the back burner.' },
  { value: 'revision', label: 'Revision phase', desc: "Content done. Now it's cycles, mocks and gap-closing." },
]

const STYLE_OPTIONS = ['Visual', 'Text', 'Questions', 'Clinical cases', 'Flashcards', 'Interactive models', 'Audio', 'Mixed']

const RESOURCE_OPTIONS = ['Marrow', 'PW', 'PrepLadder', 'DAMS', 'Cerebellum', 'Other']

const RESOURCE_NOTE =
  "MEDULA never copies these platforms' content. Tell us what you use and it becomes the intelligence layer above them — after a lecture, we queue the recall, questions and revision that make it stick."

const stepVariants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 44 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -44 }),
}

// ─── Small presentational helpers ───

function StepHeader({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-cyan-500/20 bg-cyan-500/10 text-cyan-500 dark:text-cyan-300">
        <Icon className="size-5" aria-hidden />
      </div>
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">{sub}</p>
      </div>
    </div>
  )
}

function Segmented({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: number; label: string }[]
  value: number | null
  onChange: (v: number) => void
  ariaLabel: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-11 rounded-xl border px-3 text-sm font-medium transition-all',
            value === o.value
              ? 'border-primary/60 bg-primary/10 text-foreground shadow-[0_0_20px_-8px_rgba(34,211,238,0.55)]'
              : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Chip({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-all',
        selected
          ? 'border-cyan-400/60 bg-cyan-400/10 text-foreground'
          : 'border-line bg-surface-2 text-ink-soft hover:border-cyan-400/40 hover:text-foreground'
      )}
    >
      {selected && <Check className="size-3.5 text-cyan-400" aria-hidden />}
      {label}
    </button>
  )
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <Label>{label}</Label>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? min)}
        aria-label={label}
        className="mt-3"
      />
    </div>
  )
}

// ─── Wizard ───

export function OnboardingWizard() {
  const setView = useAppStore((s) => s.setView)
  const setProfile = useAppStore((s) => s.setProfile)
  const { toast } = useToast()
  const reduce = usePrefersReducedMotion()

  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [saving, setSaving] = useState(false)
  const [skipping, setSkipping] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('Future Dr.')
  const [year, setYear] = useState<number | null>(null)
  const [semester, setSemester] = useState(1)
  const [collegeName, setCollegeName] = useState('')
  const [collegeType, setCollegeType] = useState<CollegeType>('Government')
  const [gradYear, setGradYear] = useState(() => new Date().getFullYear() + 3)
  const [pastScore, setPastScore] = useState('')
  const [prepStage, setPrepStage] = useState<Profile['prepStage'] | null>(null)
  const [dailyHours, setDailyHours] = useState(4)
  const [weekdayHours, setWeekdayHours] = useState(5)
  const [weekendHours, setWeekendHours] = useState(8)
  const [learningStyles, setLearningStyles] = useState<string[]>([])
  const [resources, setResources] = useState<string[]>([])

  const now = new Date().getFullYear()
  const isReview = step === STEPS.length - 1
  const weeklyHours = Math.round((weekdayHours * 5 + weekendHours * 2) * 10) / 10
  const progress = Math.round(((step + 1) / STEPS.length) * 100)

  const stepValid = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0
      case 1:
        return year != null && Number.isFinite(gradYear) && gradYear >= now && gradYear <= now + 12
      case 2:
        return prepStage != null
      case 3:
        return dailyHours >= 0.5 && dailyHours <= 12 && weekdayHours >= 0 && weekendHours >= 0
      case 4:
        return learningStyles.length >= 1
      default:
        return true
    }
  }, [step, name, year, gradYear, now, prepStage, dailyHours, weekdayHours, weekendHours, learningStyles])

  const reviewRows = useMemo(
    () => [
      { k: 'Name', v: name.trim() || 'Future Dr.' },
      { k: 'Year', v: year != null ? (YEAR_LABELS[year] ?? `Year ${year}`) : '—' },
      { k: 'Semester', v: `Semester ${semester}` },
      { k: 'College', v: collegeName.trim() || '—' },
      { k: 'College type', v: collegeType },
      { k: 'Expected graduation', v: String(gradYear) },
      { k: 'Past performance', v: pastScore.trim() || '—' },
      { k: 'Prep stage', v: prepStage ? (PREP_STAGE_LABELS[prepStage] ?? prepStage) : '—' },
      { k: 'Daily target', v: `${dailyHours} h/day` },
      { k: 'Weekly capacity', v: `≈ ${weeklyHours} h/week` },
      { k: 'Learning styles', v: learningStyles.join(', ') || '—' },
      { k: 'Resources', v: resources.join(', ') || 'None' },
    ],
    [name, year, semester, collegeName, collegeType, gradYear, pastScore, prepStage, dailyHours, weeklyHours, learningStyles, resources]
  )

  // Choosing a year auto-derives semester and expected graduation (user can override after).
  const chooseYear = (y: number) => {
    setYear(y)
    setSemester(Math.min((y - 1) * 2 + 1, 8))
    setGradYear(now + (y <= 4 ? 5 - y : 1))
  }

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  const next = () => {
    if (!stepValid) return
    setError(null)
    setDir(1)
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  const back = () => {
    setError(null)
    setDir(-1)
    setStep((s) => Math.max(s - 1, 0))
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || isReview || saving || skipping) return
    const el = e.target as HTMLElement
    if (el.tagName === 'BUTTON' || el.tagName === 'TEXTAREA') return
    if (el.closest('[role="listbox"]')) return
    if (!stepValid) return
    e.preventDefault()
    next()
  }

  const enterMedula = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const res = await api.saveProfile({
        name: name.trim() || 'Future Dr.',
        year: year ?? 2,
        semester,
        collegeName: collegeName.trim(),
        collegeType,
        gradYear,
        pastScore: pastScore.trim(),
        prepStage: prepStage ?? 'serious',
        dailyHours,
        weekdayHours,
        weekendHours,
        learningStyles,
        resources,
        onboarded: true,
      })
      setProfile(res.profile)
      toast({
        title: `Welcome to MEDULA, ${res.profile.name}.`,
        description: 'Your learning system is calibrated. Preparing your command center…',
      })
      setView('os')
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — check your connection and press ENTER MEDULA again.`
          : 'Something went wrong while saving your profile. Please try again.'
      )
      setSaving(false)
    }
  }

  const skipToDemo = async () => {
    if (skipping || saving) return
    setSkipping(true)
    try {
      await api.saveProfile({ onboarded: true })
    } catch {
      toast({ title: 'Could not reach the server — continuing with the demo student.' })
    }
    setView('os')
  }

  const motionCustom = reduce ? 0 : dir

  return (
    <div className="relative min-h-svh overflow-hidden bg-background text-foreground">
      <div className="med-grid absolute inset-0" aria-hidden />
      <div
        className="absolute left-1/2 top-[-15%] h-[420px] w-[680px] -translate-x-1/2 rounded-full bg-cyan-500/[0.06] blur-3xl"
        aria-hidden
      />

      {/* Persistent skip — demo student is always one tap away */}
      <div className="absolute right-4 top-4 z-10 sm:right-6 sm:top-6">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 rounded-full text-xs text-muted-foreground hover:text-foreground"
          onClick={skipToDemo}
          disabled={skipping || saving}
        >
          {skipping && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
          Use demo student →
        </Button>
      </div>

      <div className="relative flex min-h-svh items-center justify-center px-4 py-20 sm:py-16">
        <div
          className="glass-strong w-full max-w-xl rounded-3xl p-5 shadow-2xl sm:p-8"
          onKeyDown={onKeyDown}
        >
          {/* Header: wordmark + step counter */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <LogoMark size={30} />
              <span className="text-base font-extrabold tracking-tight">MEDULA</span>
            </div>
            <p className="text-xs font-medium tracking-wide text-muted-foreground" aria-live="polite">
              {isReview ? 'Final review' : `Step ${step + 1} of ${STEPS.length}`}
            </p>
          </div>

          <Progress value={progress} className="mt-4 h-1.5" />

          {/* Step dots */}
          <div className="mt-3 flex items-center justify-center gap-1.5" aria-hidden>
            {STEPS.map((s, i) => (
              <span
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/25'
                )}
              />
            ))}
          </div>

          {/* Step body */}
          <div className="mt-6 min-h-[380px] sm:min-h-[400px]">
            <AnimatePresence mode="wait" custom={motionCustom} initial={false}>
              <motion.div
                key={step}
                custom={motionCustom}
                variants={stepVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: reduce ? 0.12 : 0.32, ease: EASE }}
              >
                {step === 0 && (
                  <>
                    <StepHeader
                      icon={Sparkles}
                      title="Welcome, future doctor."
                      sub="Five minutes of setup — then MEDULA starts working like a system, not a pile of PDFs."
                    />
                    <div className="mt-6 space-y-2">
                      <Label htmlFor="ob-name">What should we call you?</Label>
                      <Input
                        id="ob-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        autoComplete="name"
                        maxLength={60}
                        className="h-11"
                      />
                      {name.trim().length === 0 && (
                        <p className="text-xs text-sev-warn">A name is required to continue.</p>
                      )}
                    </div>
                    <ul className="mt-6 space-y-3.5 text-sm leading-relaxed text-ink-soft">
                      <li className="flex gap-3">
                        <Network className="mt-0.5 size-4 shrink-0 text-cyan-400" aria-hidden />
                        Your entire MBBS curriculum, connected into one navigable knowledge map.
                      </li>
                      <li className="flex gap-3">
                        <Target className="mt-0.5 size-4 shrink-0 text-cyan-400" aria-hidden />
                        Daily missions picked by an engine that knows what you knew — and what you forgot.
                      </li>
                      <li className="flex gap-3">
                        <Route className="mt-0.5 size-4 shrink-0 text-cyan-400" aria-hidden />
                        A NEET-PG roadmap that starts today, not after internship panic sets in.
                      </li>
                    </ul>
                  </>
                )}

                {step === 1 && (
                  <>
                    <StepHeader
                      icon={GraduationCap}
                      title="Where are you in MBBS?"
                      sub="This calibrates the map — subjects, depth and exam weight all shift with your year."
                    />
                    <div className="mt-6 space-y-5">
                      <div>
                        <Label>Current year</Label>
                        <div className="mt-2">
                          <Segmented
                            options={YEAR_OPTIONS}
                            value={year}
                            onChange={chooseYear}
                            ariaLabel="Current MBBS year"
                          />
                        </div>
                        {year == null && (
                          <p className="mt-2 text-xs text-sev-warn">Pick your current year to continue.</p>
                        )}
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <Label htmlFor="ob-sem">Semester</Label>
                          <Select value={String(semester)} onValueChange={(v) => setSemester(Number(v))}>
                            <SelectTrigger id="ob-sem" className="mt-2 h-11 w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {SEMESTERS.map((s) => (
                                <SelectItem key={s} value={String(s)}>
                                  Semester {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <p className="mt-1.5 text-xs text-muted-foreground">
                            Auto-set from your year — adjust if needed.
                          </p>
                        </div>
                        <div>
                          <Label htmlFor="ob-grad">Expected graduation</Label>
                          <Input
                            id="ob-grad"
                            type="number"
                            min={now}
                            max={now + 12}
                            value={gradYear || ''}
                            onChange={(e) => setGradYear(Number(e.target.value))}
                            className="mt-2 h-11"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="ob-college">
                          College name <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="ob-college"
                          value={collegeName}
                          onChange={(e) => setCollegeName(e.target.value)}
                          placeholder="e.g. Grant Government Medical College"
                          className="mt-2 h-11"
                        />
                      </div>
                      <div>
                        <Label>College type</Label>
                        <div className="mt-2 grid grid-cols-3 gap-2">
                          {COLLEGE_TYPES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              aria-pressed={collegeType === t}
                              onClick={() => setCollegeType(t)}
                              className={cn(
                                'min-h-11 rounded-xl border px-2 text-sm font-medium transition-all',
                                collegeType === t
                                  ? 'border-primary/60 bg-primary/10 text-foreground'
                                  : 'border-line bg-surface-2 text-ink-soft hover:border-primary/40 hover:text-foreground'
                              )}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="ob-past">
                          Previous performance{' '}
                          <span className="font-normal text-muted-foreground">(optional)</span>
                        </Label>
                        <Input
                          id="ob-past"
                          value={pastScore}
                          onChange={(e) => setPastScore(e.target.value)}
                          placeholder="e.g. Distinction in Anatomy"
                          className="mt-2 h-11"
                        />
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <StepHeader
                      icon={Brain}
                      title="How serious is your NEET-PG preparation?"
                      sub="Honest answers make the engine honest back — pacing, intensity and revision cycles follow from this."
                    />
                    <div
                      role="radiogroup"
                      aria-label="NEET-PG preparation stage"
                      className="mt-6 grid gap-2 sm:grid-cols-2"
                    >
                      {PREP_OPTIONS.map((o) => (
                        <button
                          key={o.value}
                          type="button"
                          role="radio"
                          aria-checked={prepStage === o.value}
                          onClick={() => setPrepStage(o.value)}
                          className={cn(
                            'min-h-11 rounded-xl border p-3 text-left transition-all',
                            prepStage === o.value
                              ? 'border-cyan-400/60 bg-cyan-400/10 shadow-[0_0_20px_-8px_rgba(34,211,238,0.55)]'
                              : 'border-line bg-surface-2 hover:border-cyan-400/40'
                          )}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold">
                            {prepStage === o.value && (
                              <Check className="size-3.5 shrink-0 text-cyan-400" aria-hidden />
                            )}
                            {o.label}
                          </span>
                          <span className="mt-1 block text-xs leading-relaxed text-ink-soft">{o.desc}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <>
                    <StepHeader
                      icon={Clock}
                      title="How much time do you actually have?"
                      sub="Be real, not aspirational — the daily plan only works if it fits your life."
                    />
                    <div className="mt-6 space-y-6">
                      <SliderRow
                        label="Daily study target"
                        value={dailyHours}
                        min={0.5}
                        max={12}
                        step={0.5}
                        unit="h/day"
                        onChange={setDailyHours}
                      />
                      <SliderRow
                        label="Weekday availability"
                        value={weekdayHours}
                        min={0}
                        max={14}
                        step={0.5}
                        unit="h/weekday"
                        onChange={setWeekdayHours}
                      />
                      <SliderRow
                        label="Weekend availability"
                        value={weekendHours}
                        min={0}
                        max={14}
                        step={0.5}
                        unit="h/weekend day"
                        onChange={setWeekendHours}
                      />
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.06] px-4 py-3 text-sm">
                        <span className="text-ink-soft">Capacity estimate · </span>
                        <span className="font-semibold text-foreground">≈ {weeklyHours} h/week</span>
                      </div>
                    </div>
                  </>
                )}

                {step === 4 && (
                  <>
                    <StepHeader
                      icon={Palette}
                      title="How does knowledge stick for you?"
                      sub="Pick at least one — the engine adapts your daily activity mix to these."
                    />
                    <div className="mt-6 flex flex-wrap gap-2">
                      {STYLE_OPTIONS.map((s) => (
                        <Chip
                          key={s}
                          label={s}
                          selected={learningStyles.includes(s)}
                          onToggle={() => setLearningStyles((cur) => toggleIn(cur, s))}
                        />
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground" aria-live="polite">
                      {learningStyles.length === 0
                        ? 'Select at least one style to continue.'
                        : `${learningStyles.length} selected — lectures, questions and revision will be weighted toward these. You can change this anytime.`}
                    </p>
                  </>
                )}

                {step === 5 && (
                  <>
                    <StepHeader
                      icon={Layers}
                      title="What do you study from?"
                      sub="Optional — but telling MEDULA lets it build the intelligence layer above your platforms."
                    />
                    <div className="mt-6 flex flex-wrap gap-2">
                      {RESOURCE_OPTIONS.map((r) => (
                        <Chip
                          key={r}
                          label={r}
                          selected={resources.includes(r)}
                          onToggle={() => setResources((cur) => toggleIn(cur, r))}
                        />
                      ))}
                    </div>
                    <div className="mt-6 flex gap-3 rounded-xl border border-line bg-surface-2 p-4">
                      <Info className="mt-0.5 size-4 shrink-0 text-info" aria-hidden />
                      <p className="text-sm leading-relaxed text-ink-soft">{RESOURCE_NOTE}</p>
                    </div>
                  </>
                )}

                {step === 6 && (
                  <>
                    <StepHeader
                      icon={ListChecks}
                      title="Everything checks out?"
                      sub="You can fine-tune all of this later in Profile — nothing here is locked in."
                    />
                    <dl className="mt-6 divide-y divide-line overflow-hidden rounded-xl border border-line">
                      {reviewRows.map((r) => (
                        <div key={r.k} className="flex items-start justify-between gap-4 px-4 py-2.5">
                          <dt className="shrink-0 text-sm text-muted-foreground">{r.k}</dt>
                          <dd className="max-w-[62%] text-right text-sm font-medium">{r.v}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer nav */}
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="outline"
              className="h-11 min-w-24 rounded-xl"
              onClick={back}
              disabled={step === 0 || saving || skipping}
            >
              <ChevronLeft className="size-4" aria-hidden />
              Back
            </Button>
            {isReview ? (
              <Button
                className="h-11 min-w-44 rounded-xl text-sm font-semibold tracking-wide"
                onClick={enterMedula}
                disabled={saving || !stepValid}
              >
                {saving ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                    Entering…
                  </>
                ) : (
                  <>
                    ENTER MEDULA
                    <ChevronRight className="size-4" aria-hidden />
                  </>
                )}
              </Button>
            ) : (
              <Button
                className="h-11 min-w-28 rounded-xl text-sm font-semibold"
                onClick={next}
                disabled={!stepValid || saving || skipping}
              >
                {step === STEPS.length - 2 ? 'Review' : 'Next'}
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            )}
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
