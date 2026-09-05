import { Button, Disclosure } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { ErrorBoundaryFallbackProps } from '@shared/hocs/error-boundary'

import { formatErrorDetails } from './server-error.model'
import classes from './ServerError.module.css'

function ErrorDetailsPanel({ details }: { details: string }) {
    const [copyStatus, setCopyStatus] = useState<'idle' | 'pending' | 'copied' | 'error'>('idle')
    const copyGeneration = useRef(0)

    useEffect(
        () => () => {
            copyGeneration.current += 1
        },
        [details]
    )
    useEffect(() => {
        if (copyStatus !== 'copied') return
        const timer = setTimeout(() => setCopyStatus('idle'), 1500)
        return () => clearTimeout(timer)
    }, [copyStatus])

    const copyDetails = async () => {
        const generation = ++copyGeneration.current
        setCopyStatus('pending')
        try {
            await navigator.clipboard.writeText(details)
            if (generation === copyGeneration.current) setCopyStatus('copied')
        } catch {
            if (generation === copyGeneration.current) setCopyStatus('error')
        }
    }

    return (
        <Disclosure className={classes.disclosure}>
            <Disclosure.Heading>
                <Disclosure.Trigger>
                    Error details
                    <Disclosure.Indicator />
                </Disclosure.Trigger>
            </Disclosure.Heading>
            <Disclosure.Content>
                <Disclosure.Body>
                    <div className={classes.detailActions}>
                        <Button
                            isPending={copyStatus === 'pending'}
                            onPress={copyDetails}
                            size="sm"
                            variant="secondary"
                        >
                            {copyStatus === 'copied' ? 'Copied' : 'Copy error details'}
                        </Button>
                        <span aria-live="polite" role="status">
                            {copyStatus === 'error' && 'Unable to copy error details'}
                        </span>
                    </div>
                    <pre className={classes.details} dir="ltr" tabIndex={0}>
                        <code>
                            {details.split('\n').map((line, index) => (
                                <span className={classes.codeLine} key={index}>
                                    {line || '\u200b'}
                                </span>
                            ))}
                        </code>
                    </pre>
                </Disclosure.Body>
            </Disclosure.Content>
        </Disclosure>
    )
}

export function ErrorPageComponent({ componentStack, error }: Partial<ErrorBoundaryFallbackProps>) {
    const navigate = useNavigate()
    const details = formatErrorDetails(error, componentStack)

    return (
        <main className={classes.root}>
            <div className={classes.container}>
                <div className={classes.label}>500</div>
                <h1 className={classes.title}>Something bad just happened...</h1>
                <div className={classes.actions}>
                    <Button onPress={() => navigate(0)} size="md" variant="secondary">
                        Refresh the page
                    </Button>
                </div>
                {details && <ErrorDetailsPanel details={details} key={details} />}
            </div>
        </main>
    )
}
