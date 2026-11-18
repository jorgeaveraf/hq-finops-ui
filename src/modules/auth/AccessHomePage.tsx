import { Link } from 'react-router-dom'
import { useAuth } from './useAuth'

export function AccessHomePage() {
  const { user, access } = useAuth()
  const grants = access?.effective_grants ?? []
  const canReadClients = grants.some((grant) => grant.operation === 'client.read')

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-hq-teal">FinOps Console</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">My access</h1>
        <p className="mt-2 text-sm text-slate-600">Signed in as {user?.name} ({user?.email}). Your Gateway role is {access?.user.role}.</p>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="text-lg font-semibold text-slate-900">Effective permissions</h2>
        {grants.length ? (
          <ul className="mt-4 space-y-2">
            {grants.map((grant) => (
              <li key={grant.id} className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <span className="font-semibold">{grant.operation}</span>
                <span className="ml-2 text-slate-500">{grant.client_id ?? 'Global'} · {grant.environment ?? 'No environment restriction'}</span>
              </li>
            ))}
          </ul>
        ) : <p className="mt-3 text-sm text-slate-600">No permissions have been assigned.</p>}
      </section>
      {canReadClients && <Link to="/qbo/clients" className="inline-flex rounded-xl bg-hq-teal px-4 py-2.5 text-sm font-semibold text-white hover:bg-hq-tealDark">View permitted entities</Link>}
      <Link to="/access/keys" className="ml-3 inline-flex rounded-xl border border-hq-teal px-4 py-2.5 text-sm font-semibold text-hq-teal">Manage my API keys</Link>
    </div>
  )
}
