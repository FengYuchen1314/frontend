import { useEffect, useRef, useState } from 'react'

export function useNavigationMenu() {
    const [openId, setOpenId] = useState<string | null>(null)
    const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const cancelClose = () => {
        clearTimeout(timer.current)
        timer.current = undefined
    }
    useEffect(() => () => clearTimeout(timer.current), [])
    return {
        openId,
        cancelClose,
        setOpen: (id: string, open: boolean) => {
            cancelClose()
            setOpenId((current) => (open ? id : current === id ? null : current))
        },
        scheduleClose: (id: string) => {
            cancelClose()
            timer.current = setTimeout(
                () => setOpenId((current) => (current === id ? null : current)),
                180
            )
        }
    }
}
