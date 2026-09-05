import { Button, toast } from '@heroui/react'
import { useEffect, useRef, useState } from 'react'
import { TbCheck, TbCopy } from 'react-icons/tb'

import { useControlLifetime } from './use-control-lifetime'

export function CopyValueButton({
    value,
    label,
    signal
}: {
    value: string
    label: string
    signal?: AbortSignal
}) {
    const [copied, setCopied] = useState(false)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const capture = useControlLifetime(signal)
    useEffect(() => () => clearTimeout(timer.current), [])
    const copy = async () => {
        const current = capture()
        if (!current()) return
        try {
            await navigator.clipboard.writeText(value)
            if (!current()) return
            setCopied(true)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => {
                if (current()) setCopied(false)
            }, 2_000)
        } catch (error) {
            if (current())
                toast.danger('Copy failed', {
                    description: error instanceof Error ? error.message : undefined
                })
        }
    }
    return (
        <Button
            aria-label={copied ? 'Copied' : label}
            isIconOnly
            onPress={() => void copy()}
            size="sm"
            variant="ghost"
        >
            {copied ? <TbCheck aria-hidden size={16} /> : <TbCopy aria-hidden size={16} />}
        </Button>
    )
}
