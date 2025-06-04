import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { cloudRouteTree } from './router/cloudRouter';
// import { localRouteTree } from './router/localRouter';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/react-query/queryClient';
import { ClusterProvider } from '@/features/cluster/context/ClusterAuthContext';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
// import { toast } from 'sonner';
import { Toaster } from '@/components/ui/sonner';
import ErrorComponent from '@/components/ErrorComponent';
import NotFoundComponent from '@/components/NotFoundComponent';

function App() {
	// const isLocalStudio = import.meta.env.VITE_LOCAL_STUDIO == 'true';
	const hashHistory = createHashHistory();
	// const loadedRouter = isLocalStudio ? localRouteTree : cloudRouteTree;
	const loadedRouter = cloudRouteTree;

	const router = createRouter({
		routeTree: loadedRouter,
		history: hashHistory,
		defaultNotFoundComponent: () => <NotFoundComponent />,
		defaultErrorComponent: ({ error }) => <ErrorComponent error={error} />,
		defaultPreload: 'intent',
		// Since we're using React Query, we don't want loader calls to ever be stale
		// This will ensure that the loader is always called when the route is preloaded or visited
		defaultPreloadStaleTime: 0,
		scrollRestoration: true,
		context: {
			queryClient,
		},
	});

	return (
		<>
			<QueryClientProvider client={queryClient}>
				<ClusterProvider>
					<RouterProvider router={router} />
				</ClusterProvider>
				<ReactQueryDevtools buttonPosition="bottom-left" />
				<TanStackRouterDevtools router={router} />
				{/* <button
					className="fixed p-2 text-white bg-blue-400 rounded-md bottom-4 right-4"
					onClick={() => {
						document.documentElement.classList.toggle('dark');
						localStorage.setItem('theme', document.documentElement.classList.contains('dark') ? 'dark' : 'light');
					}}
				>
					Toggle Theme
				</button> */}
				{/* <button
					className="fixed p-2 text-white bg-blue-400 rounded-md bottom-20 right-20"
					onClick={() => {
						toast.success('Error', {
							description: 'testinggg',
							action: {
								label: 'Dismiss',
								onClick: () => toast.dismiss(),
							},
							duration: 100000,
						});
					}}
				>
					testing toast component
				</button> */}
				<Toaster richColors />
			</QueryClientProvider>
		</>
	);
}

export default App;
