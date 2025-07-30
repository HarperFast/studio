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
			<span className="absolute bottom-4 right-4 text-sm text-white-500">
				Harper Studio v{import.meta.env.VITE_STUDIO_VERSION}
			</span>
		</>
	);
}
