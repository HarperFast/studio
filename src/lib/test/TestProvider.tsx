import { queryClient } from '@/react-query/queryClient';
import { useNewRouter } from '@/router/useNewRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { ReactNode } from 'react';

export function TestProvider({ children }: { children: ReactNode }) {
	const router = useNewRouter({});
	return (
		<QueryClientProvider client={queryClient}>
			<RouterProvider
				router={router}
				defaultComponent={() => children} />
		</QueryClientProvider>
	);
}
