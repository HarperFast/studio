import { queryClient } from '@/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { createHashHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { ReactNode, useEffect, useState } from 'react';

/**
 * Router and query contexts for a component under test, without the app's routes around it: those
 * put it under `Dashboard`, which renders nothing for a signed-out user.
 */
export function TestProvider({ children }: { children: ReactNode }) {
	const [router] = useState(() => createRouter({ routeTree: createRootRoute(), history: createHashHistory() }));
	// A hash history patches `window.history`; one left behind would answer the next test's navigation.
	useEffect(() => () => router.history.destroy(), [router]);
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider
				router={router}
				defaultComponent={() => children}
			/>
		</QueryClientProvider>
	);
}
