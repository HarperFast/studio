import { RefreshCw } from 'lucide-react';

export function LoadingState() {
	return (
		<div className="loading-state">
			<RefreshCw className="animate-spin" size={24} />
			<p>Loading conversation...</p>
		</div>
	);
}
