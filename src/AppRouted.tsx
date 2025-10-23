import { useRootAuthenticationContext } from '@/hooks/useAuth';
import { useNewRouter } from '@/router/useNewRouter';
import { RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';

export function AppRouted() {
	const authentication = useRootAuthenticationContext();
	const router = useNewRouter({ authentication });
	return (
		<>
			<RouterProvider router={router} context={{ authentication }} />
			{import.meta.env.DEV && <TanStackRouterDevtools router={router} position="bottom-right" />}
		</>
	);
}
