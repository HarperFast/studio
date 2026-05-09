import { Component, type ReactNode } from 'react';

interface Props {
	metric: string;
	/** When this changes, the boundary clears its caught-error state so the
	 *  child gets a fresh render attempt. Wire to the time-range stamp so a
	 *  user changing the window retries the panel without a page reload. */
	resetKey?: string | number;
	children: ReactNode;
}

interface State {
	failed: boolean;
	message?: string;
	lastResetKey?: string | number;
}

export class PanelErrorBoundary extends Component<Props, State> {
	state: State = { failed: false };

	static getDerivedStateFromError(error: unknown): Partial<State> {
		return { failed: true, message: error instanceof Error ? error.message : String(error) };
	}

	static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
		if (prevState.lastResetKey !== nextProps.resetKey) {
			return { failed: false, message: undefined, lastResetKey: nextProps.resetKey };
		}
		return null;
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
