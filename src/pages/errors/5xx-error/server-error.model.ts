export function formatErrorDetails(error: unknown, componentStack?: string | null): string {
    return [
        error instanceof Error ? (error.stack ?? '') : '',
        componentStack ? `Component stack:${componentStack}` : ''
    ]
        .filter(Boolean)
        .join('\n\n')
}
