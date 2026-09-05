import type { CSSProperties, ReactNode } from 'react'

import styles from './CodeEditor.module.css'

type Status = 'error' | 'success' | 'warning'

const TONES: Record<Status, { background: string; border: string; code: string }> = {
    error: { background: 'rgba(241, 65, 65, 0.1)', border: 'rgb(241, 65, 65)', code: 'red' },
    success: { background: 'rgba(51, 171, 132, 0.1)', border: 'rgb(51, 171, 132)', code: 'teal' },
    warning: { background: 'rgba(255, 170, 0, 0.1)', border: 'rgb(255, 170, 0)', code: 'orange' }
}

interface Props {
    children: ReactNode
    status: Status
}

export function EditorStatusBar(props: Props) {
    const { children, status } = props
    const tone = TONES[status]

    return (
        <div
            className={styles.statusBar}
            role={status === 'error' ? 'alert' : 'status'}
            style={
                {
                    backgroundColor: tone.background,
                    borderTop: `1px solid ${tone.border}`
                } as CSSProperties
            }
        >
            {typeof children === 'string' ? (
                <code className={styles.statusCode}>{children}</code>
            ) : (
                children
            )}
        </div>
    )
}
