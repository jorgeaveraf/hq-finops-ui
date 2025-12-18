import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import clsx from 'clsx'
import { ChevronDown, ChevronUp, ExternalLink, RefreshCcw, X } from 'lucide-react'
import { Alert } from '../../../components/Alert'
import { Button } from '../../../components/Button'
import { describeGatewayError, fetchReconnectLink } from '../api/qboGatewayClient'
import type { QboEnvironment, QboReconnectResponse } from '../api/qboGatewayClient'

type ReconnectButtonProps = {
  clientId: string
  clientName?: string
  environment?: QboEnvironment | string
  environments?: ReadonlyArray<QboEnvironment | string>
  buttonLabel?: string
  showResult?: boolean
  size?: 'sm' | 'md'
  className?: string
  revealLabelOnHover?: boolean
  onRefresh?: () => void | Promise<void>
  inlinePanel?: boolean
  onResponse?: (response: QboReconnectResponse) => void
  onError?: (message: string) => void
}

export function ReconnectButton({
  clientId,
  clientName,
  environment,
  environments,
  buttonLabel = 'Reconnect QuickBooks',
  showResult = true,
  size = 'md',
  className,
  revealLabelOnHover = false,
  onRefresh,
  inlinePanel = false,
  onResponse,
  onError,
}: ReconnectButtonProps) {
  const [result, setResult] = useState<QboReconnectResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(inlinePanel)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLSpanElement | null>(null)

  const clientLabel = clientName || clientId || 'this client'

  const envOptions = useMemo(() => {
    if (environments && environments.length > 0) return [...environments]
    if (environment) return [environment as QboEnvironment | string]
    return []
  }, [environments, environment])

  useEffect(() => {
    if (!isOpen || inlinePanel) return
    const handleClickOutside = (evt: MouseEvent) => {
      const target = evt.target as Node
      const clickedPopover = popoverRef.current?.contains(target)
      const clickedTrigger = triggerRef.current?.contains(target)
      if (!clickedPopover && !clickedTrigger) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen, inlinePanel])

  const toggleOpen = () => {
    if (inlinePanel) return
    setIsOpen((prev) => !prev)
    setError(null)
    setResult(null)
  }

  const handleSelectEnv = async (env: QboEnvironment | string) => {
    setIsLoading(true)
    setError(null)
    setResult(null)
    try {
      const response = await fetchReconnectLink({ clientId, environment: env as QboEnvironment })
      if (showResult) {
        setResult(response)
      }
      onResponse?.(response)
    } catch (err) {
      const message = describeGatewayError(err, 'Unable to start QuickBooks reconnect.')
      setError(message)
      onError?.(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={clsx('space-y-2 relative', className)}>
      <span ref={triggerRef} className="inline-flex">
        <Button
          size={size}
          onClick={toggleOpen}
          disabled={isLoading}
          className={clsx(
            // IMPORTANT: group enables group-hover tooltip
            'group relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-transparent bg-hq-teal text-white shadow-sm transition hover:bg-hq-teal/90 hover:shadow',
            'disabled:opacity-60 disabled:cursor-not-allowed',
            inlinePanel ? 'w-auto px-4' : '',
          )}
          title={revealLabelOnHover ? undefined : buttonLabel}
        >
          <RefreshCcw className="h-4 w-4" />

          {/* Tooltip only when not inlinePanel */}
          {!inlinePanel && revealLabelOnHover && (
            <span className="pointer-events-none absolute left-1/2 top-full z-20 -translate-x-1/2 translate-y-2 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[11px] text-white shadow-lg opacity-0 transition-all duration-300 delay-150 group-hover:opacity-100">
              {isLoading ? 'Requesting…' : buttonLabel}
            </span>
          )}

          {inlinePanel && (
            <span className="ml-2 text-sm font-semibold">
              {isLoading ? 'Requesting…' : buttonLabel}
            </span>
          )}
        </Button>
      </span>

      {isOpen && inlinePanel && (
        <div className="static mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-2xl p-3 space-y-3">
          <p className="text-sm font-semibold text-slate-900">Reconnect QuickBooks</p>
          <p className="text-xs text-slate-500">Reconnect QuickBooks from {clientLabel}</p>
          {envOptions.length === 0 ? (
            <p className="text-xs text-slate-600">No environments available for reconnect.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {envOptions.map((env) => (
                <button
                  key={env}
                  type="button"
                  className={clsx(
                    'rounded-full border px-3 py-1 text-xs font-semibold transition',
                    isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:border-hq-teal hover:text-hq-teal',
                  )}
                  onClick={() => handleSelectEnv(env)}
                  disabled={isLoading}
                >
                  {String(env)}
                </button>
              ))}
            </div>
          )}

          {showResult ? (
            <>
              {error && <Alert title="Reconnect failed" description={error} variant="error" />}
              {result && <ReconnectResultCard response={result} />}
              {result && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    OAuth started. Complete it in QuickBooks, then refresh status.
                  </p>
                  <div className="flex items-center gap-2">
                    {result.redirect_url && (
                      <Button
                        asChild
                        size="sm"
                        variant="secondary"
                        icon={<ExternalLink className="h-4 w-4" />}
                      >
                        <a href={result.redirect_url} target="_blank" rel="noreferrer">
                          Open QuickBooks
                        </a>
                      </Button>
                    )}
                    {onRefresh && (
                      <Button size="sm" variant="secondary" onClick={onRefresh}>
                        Refresh status
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            error && <p className="text-xs text-rose-600">{error}</p>
          )}
        </div>
      )}

      {isOpen && !inlinePanel
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4"
              onClick={() => setIsOpen(false)}
            >
              <div
                ref={popoverRef}
                className="rounded-xl border border-slate-200 bg-white shadow-2xl p-4 space-y-3 w-[min(22rem,calc(100vw-1.5rem))] max-h-[70vh] overflow-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between">
                  <p className="text-sm font-semibold text-slate-900">Reconnect QuickBooks</p>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="text-slate-400 hover:text-slate-600"
                    aria-label="Close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="text-xs text-slate-500">Reconnect QuickBooks from {clientLabel}</p>

                {envOptions.length === 0 ? (
                  <p className="text-xs text-slate-600">No environments available for reconnect.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {envOptions.map((env) => (
                      <button
                        key={env}
                        type="button"
                        className={clsx(
                          'rounded-full border px-3 py-1 text-xs font-semibold transition',
                          isLoading ? 'opacity-60 cursor-not-allowed' : 'hover:border-hq-teal hover:text-hq-teal',
                        )}
                        onClick={() => handleSelectEnv(env)}
                        disabled={isLoading}
                      >
                        {String(env)}
                      </button>
                    ))}
                  </div>
                )}

                {showResult ? (
                  <>
                    {error && <Alert title="Reconnect failed" description={error} variant="error" />}
                    {result && <ReconnectResultCard response={result} />}
                    {result && (
                      <div className="space-y-2">
                        <p className="text-xs text-slate-600">
                          OAuth started. Complete it in QuickBooks, then refresh status.
                        </p>
                        <div className="flex items-center gap-2">
                          {result.redirect_url && (
                            <Button
                              asChild
                              size="sm"
                              variant="secondary"
                              icon={<ExternalLink className="h-4 w-4" />}
                            >
                              <a href={result.redirect_url} target="_blank" rel="noreferrer">
                                Open QuickBooks
                              </a>
                            </Button>
                          )}
                          {onRefresh && (
                            <Button size="sm" variant="secondary" onClick={onRefresh}>
                              Refresh status
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  error && <p className="text-xs text-rose-600">{error}</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}

function ReconnectResultCard({ response }: { response: QboReconnectResponse }) {
  const [showTechnical, setShowTechnical] = useState(false)

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">QuickBooks connection ready</p>
          <p className="text-sm text-slate-700">
            Reconnect QuickBooks to refresh authorization and continue syncing.
          </p>
        </div>
      </div>
      <button
        type="button"
        className="flex items-center gap-2 text-xs font-semibold text-slate-700 hover:text-slate-900"
        onClick={() => setShowTechnical((prev) => !prev)}
      >
        {showTechnical ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Technical details
      </button>
      {showTechnical && (
        <div className="flex flex-wrap gap-3 text-xs text-slate-600">
          <InfoPill label="client_id" value={response.client_id} />
          <InfoPill label="environment" value={String(response.environment)} />
          {response.request_id && <InfoPill label="request_id" value={response.request_id} />}
          {response.message && <InfoPill label="message" value={response.message} />}
        </div>
      )}
    </div>
  )
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 border border-slate-200">
      <span className="uppercase text-[11px] font-semibold text-slate-500">{label}</span>
      <code className="text-xs text-slate-800">{value}</code>
    </span>
  )
}
