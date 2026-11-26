export function EntitySelectionToolbar({ allSelected, hasSelection, showSelectedOnly, onSelectAll, onClear, onToggleSelected }: {
  allSelected: boolean
  hasSelection: boolean
  showSelectedOnly: boolean
  onSelectAll: () => void
  onClear: () => void
  onToggleSelected: () => void
}) {
  const base = 'min-h-9 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-hq-teal disabled:cursor-not-allowed disabled:opacity-40'
  return <div role="group" aria-label="Entity selection actions" className="mt-3 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
    <button type="button" disabled={allSelected} onClick={onSelectAll} className={`${base} border-slate-300 bg-white text-slate-700 hover:border-hq-teal hover:text-hq-teal`}>Select all available</button>
    <button type="button" disabled={!hasSelection} onClick={onClear} className={`${base} border-slate-300 bg-white text-slate-700 hover:border-hq-teal hover:text-hq-teal`}>Clear selection</button>
    <button type="button" aria-pressed={showSelectedOnly} disabled={!hasSelection && !showSelectedOnly} onClick={onToggleSelected} className={`${base} ml-auto ${showSelectedOnly ? 'border-hq-teal bg-teal-50 text-hq-teal' : 'border-slate-300 bg-white text-slate-700 hover:border-hq-teal hover:text-hq-teal'}`}>Show selected</button>
  </div>
}
