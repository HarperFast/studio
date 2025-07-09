import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from '@/react-query/queryClient';
import { Toaster } from '@/components/ui/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppRouted } from '@/AppRouted';

export function App() {
	return (
		<>
			<QueryClientProvider client={queryClient}>
				<AppRouted />
				<ReactQueryDevtools buttonPosition="bottom-right" />
			</QueryClientProvider>
			<Toaster richColors />
		</>
	);
}
