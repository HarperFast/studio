import { Component, type ReactNode } from 'react';

interface Props {
	metric: string;
	children: ReactNode;
}

interface State {
	failed: boolean;
	message?: string;
}

export class PanelErrorBoundary extends Component<Props, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(error: unknown): State {
		return { failed: true, message: error instanceof Error ? error.message : String(error) };
	}

	componentDidCatch(error: Error) {
		console.error(`[panel:${this.props.metric}] render failed`, error);
	}

	render() {
		if (this.state.failed) {
			return (
				<div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
					<div className="font-medium mb-1">{`Panel "${this.props.metric}" is unavailable`}</div>
					<div className="text-xs opacity-80">{this.state.message}</div>
				</div>
			);
		}
		return this.props.children;
	}
}
