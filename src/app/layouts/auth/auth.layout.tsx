import { Outlet } from 'react-router'

export function AuthLayout() {
    return (
        <main className="flex min-h-dvh w-full items-center justify-center bg-background px-4 py-10 text-foreground sm:px-6">
            <div className="w-full max-w-md">
                <Outlet />
            </div>
        </main>
    )
}
