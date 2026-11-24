import { NavLink } from 'react-router-dom'

export function AccountNavigation() {
  return <div>
    <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">My account</p>
    <nav aria-label="Account navigation" className="mt-3 flex gap-6 border-b border-slate-200">
      {[['/access', 'My access'], ['/access/keys', 'My API keys']].map(([to, label]) =>
        <NavLink key={to} end to={to} className={({ isActive }) => `border-b-2 pb-3 text-sm font-medium ${isActive ? 'border-hq-teal text-hq-teal' : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'}`}>{label}</NavLink>)}
    </nav>
  </div>
}
