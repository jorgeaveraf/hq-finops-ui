import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { ExternalLink } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { describeGatewayError, fetchReconnectLink } from '../api/qboGatewayClient'
import type { QboEnvironment } from '../api/qboGatewayClient'

type ReconnectButtonProps = {
  clientId: string
  environment?: QboEnvironment | string
  environments?: ReadonlyArray<QboEnvironment | string>
  mode?: 'connect' | 'reconnect'
  className?: string
  onAuthorizationStarted?: () => void
}

export function ReconnectButton({
  clientId,
  environment,
  environments,
  mode = 'reconnect',
  className,
  onAuthorizationStarted,
}: ReconnectButtonProps) {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [opened, setOpened] = useState(false)
  const [blockedUrl, setBlockedUrl] = useState<string | null>(null)

  const envOptions = useMemo(() => {
    if (environments?.length) return [...environments]
    return environment ? [environment] : []
  }, [environments, environment])

  const startAuthorization = async (env: QboEnvironment | string) => {
    if (isLoading) return
    // Open synchronously from the click so browsers do not block the new tab after the API request.
    let authWindow: Window | null = null
    try { authWindow = window.open('about:blank', '_blank') } catch { /* Use the manual fallback. */ }
    if (authWindow) authWindow.opener = null
    setIsLoading(true)
    setError(null)
    setOpened(false)
    setBlockedUrl(null)
    try {
      const response = await fetchReconnectLink({ clientId, environment: env as QboEnvironment })
      const url = response.redirect_url ? new URL(response.redirect_url) : null
      if (!url || url.protocol !== 'https:') throw new Error('The QuickBooks authorization link is invalid.')
      if (authWindow) {
        authWindow.location.replace(url.href)
        setOpened(true)
        onAuthorizationStarted?.()
      } else {
        // A manual link is only needed when the browser blocks the automatic tab.
        setBlockedUrl(url.href)
      }
    } catch (err) {
      authWindow?.close()
      setError(describeGatewayError(err, `Unable to start QuickBooks ${mode === 'connect' ? 'connection' : 'reconnect'}.`))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={clsx('space-y-3', className)}>
      {envOptions.length === 0 ? (
        <p className="text-sm text-slate-600">No environment is available for this connection.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {envOptions.map((env) => (
            <Button key={env} type="button" disabled={isLoading} onClick={() => void startAuthorization(env)}>
              {isLoading ? 'Preparing connection…' : envOptions.length === 1
                ? mode === 'connect' ? 'Connect QuickBooks' : 'Reconnect QuickBooks'
                : `${mode === 'connect' ? 'Connect' : 'Reconnect'} ${env}`}
            </Button>
          ))}
        </div>
      )}
      {error && <Alert title={mode === 'connect' ? 'Connection failed' : 'Reconnect failed'} description={error} variant="error" />}
      {opened && <p className="text-sm text-slate-600" role="status">QuickBooks opened in a new tab. Complete authorization there, then return to review the saved status.</p>}
      {blockedUrl && <div className="space-y-2" role="status">
        <p className="text-sm text-slate-600">Your browser blocked the new tab. Open QuickBooks to continue.</p>
        <Button asChild size="sm" icon={<ExternalLink className="h-4 w-4" />}>
          <a href={blockedUrl} target="_blank" rel="noopener noreferrer" onClick={onAuthorizationStarted}>Open QuickBooks</a>
        </Button>
      </div>}
    </div>
  )
}
