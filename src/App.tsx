import { AppRouted } from '@/AppRouted';
import { Toaster } from '@/components/ui/sonner';
import { useDatadog } from '@/integrations/datadog/datadog';
import { useGTM } from '@/integrations/google/gtm';
import { useReo } from '@/integrations/reo/reo';
import { queryClient } from '@/react-query/queryClient';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';

export function App() {
	useReo();
	useDatadog();
	useGTM();
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
