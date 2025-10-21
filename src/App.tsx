import { AppRouted } from '@/AppRouted';
import { Toaster } from '@/components/ui/sonner';
import { useDatadog } from '@/integrations/datadog/datadog';
import { useReo } from '@/integrations/reo/reo';
import { queryClient } from '@/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function App() {
	useReo();
	useDatadog();
	return (
		<>
			<QueryClientProvider client={queryClient}>
				<AppRouted />
				<ReactQueryDevtools buttonPosition="bottom-left" />
			</QueryClientProvider>
			<Toaster richColors />
		</>
	);
}
