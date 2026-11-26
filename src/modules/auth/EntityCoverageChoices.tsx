type Coverage = 'specific' | 'all' | ''

export function EntityCoverageChoices({ value, onSelect, allDisabled = false, label }: {
  value: Coverage
  onSelect: (coverage: 'specific' | 'all') => void
  allDisabled?: boolean
  label: string
}) {
  return <div role="group" aria-label={label} className="grid gap-2 sm:grid-cols-2">
    {([
      { value: 'specific', title: 'Selected entities', detail: 'Choose one or more' },
      { value: 'all', title: 'All available entities', detail: 'Current only · no future entities' },
    ] as const).map((option) => <button key={option.value} type="button" aria-pressed={value === option.value} disabled={option.value === 'all' && allDisabled} onClick={() => onSelect(option.value)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:opacity-50 ${value === option.value ? 'border-hq-teal bg-teal-50 ring-1 ring-hq-teal' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
      <span className="block text-sm font-semibold text-slate-950">{option.title}</span>
      <span className="mt-1 block text-xs text-slate-600">{option.detail}</span>
    </button>)}
  </div>
}
