import { Skeleton } from '@heroui/react'

interface SkeletonHeaderControlProps {
    width?: number | string
}

export function SkeletonHeaderControl({ width = 44 }: SkeletonHeaderControlProps) {
    return (
        <Skeleton
            aria-label="Loading header information"
            className="h-11 rounded-xl"
            style={{ width }}
        />
    )
}
