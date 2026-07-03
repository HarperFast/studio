import { useRootAuthenticationContext } from '@/hooks/useAuth';
import { useNewRouter } from '@/router/useNewRouter';
import { RouterProvider } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { useEffect, useRef } from 'react';

export function AppRouted() {
	const authentication = useRootAuthenticationContext();
	const router = useNewRouter({ authentication });
	// The RouterProvider `context` prop keeps router context current, but already-loaded
	// matches hold the context they were built with — invalidate so beforeLoad guards
	// (e.g. the dashboardLayout sign-out redirect) re-run when authentication changes.
	const lastAuthentication = useRef(authentication);
	useEffect(() => {
		if (lastAuthentication.current !== authentication) {
			lastAuthentication.current = authentication;
			void router.invalidate();
		}
	}, [router, authentication]);
	return (
		<>
			<RouterProvider router={router} context={{ authentication }} />
			{!import.meta.env.VITE_DISABLE_DEVTOOLS && <TanStackRouterDevtools router={router} position="bottom-right" />}
		</>
	);
}
