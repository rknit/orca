import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { Button } from '../../../ui/button'
import { Input } from '../../../ui/input'
import { getIntlLocale, translate } from '@/i18n/i18n'
import type { ServerTlsStatus } from '../../../../../../shared/server-tls-status'

type MobileTlsCertificateSourceSectionProps = {
  onUsePairingAddress: (address: string) => void
}

/** A browser on an https page refuses ws://, so reaching this computer from one needs wss://. */
export function MobileTlsCertificateSourceSection({
  onUsePairingAddress
}: MobileTlsCertificateSourceSectionProps): React.JSX.Element {
  const [source, setSource] = useState('')
  const [status, setStatus] = useState<ServerTlsStatus | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    void window.api.mobile.getTlsCertificateSource().then(({ sourceUrl, status: current }) => {
      setSource(sourceUrl ?? '')
      setStatus(current)
    })
  }, [])

  const save = useCallback(async (next: string) => {
    setSaving(true)
    setSaveError(null)
    try {
      const result = await window.api.mobile.setTlsCertificateSource({ sourceUrl: next || null })
      setStatus(result.status)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }, [])

  const address =
    status?.serving && status.hostname ? `wss://${status.hostname}:${status.port}` : null
  const problem = saveError ?? status?.error ?? null

  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">
          {translate('settings.mobile.tlsSource.title', 'TLS certificate source')}
        </span>
      </div>
      <p className="text-muted-foreground mb-3 text-xs">
        {translate(
          'settings.mobile.tlsSource.description',
          'Serve a secure connection for browsers using a certificate fetched from this address. Orca checks it daily.'
        )}
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="https://certs.example.com"
          aria-label={translate('settings.mobile.tlsSource.title', 'TLS certificate source')}
          autoCapitalize="off"
          spellCheck={false}
        />
        <Button
          variant="outline"
          size="sm"
          disabled={saving}
          onClick={() => void save(source.trim())}
        >
          {translate('settings.mobile.tlsSource.save', 'Save')}
        </Button>
      </div>
      {status?.serving && status.expiresAt ? (
        <p className="text-muted-foreground mt-3 text-xs">
          {translate(
            'settings.mobile.tlsSource.serving',
            'Serving {{host}}, valid until {{date}}.',
            {
              host: status.hostname ?? '',
              date: new Date(status.expiresAt).toLocaleDateString(getIntlLocale())
            }
          )}
        </p>
      ) : null}
      {problem ? <p className="text-destructive mt-3 text-xs">{problem}</p> : null}
      {address ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => onUsePairingAddress(address)}
        >
          {translate('settings.mobile.tlsSource.useAddress', 'Use {{address}} for pairing', {
            address
          })}
        </Button>
      ) : null}
    </div>
  )
}
