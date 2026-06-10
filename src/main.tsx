import { App } from '@/App';
import { addReactError } from '@datadog/browser-rum-react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

createRoot(
	document.getElementById('root')!,
	{
		onUncaughtError: (error, errorInfo) => {
			// Report uncaught errors to Datadog
			addReactError(error as Error, errorInfo);
			console.error('Uncaught error:', error, errorInfo);
		},
		onCaughtError: (error, errorInfo) => {
			// Report caught errors to Datadog
			addReactError(error as Error, errorInfo);
			console.error('Caught error:', error, errorInfo);
		},
		onRecoverableError: (error, errorInfo) => {
			// Report recoverable errors to Datadog
			addReactError(error as Error, errorInfo);
			console.warn('Recoverable error:', error, errorInfo);
		},
	},
).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
