import '@xterm/xterm/css/xterm.css';
import { Button } from '@/components/ui/button';
import { EntityIds } from '@/features/auth/store/authStore';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { resolveInstanceWsConnection } from './resolveInstanceWsConnection';
import { encodeAuth, encodeInput, encodeResize } from './wire';

type Status = 'connecting' | 'authenticating' | 'open' | 'closed' | 'error';

/**
 * Renders an xterm.js terminal bound to a Harper instance PTY over a WebSocket.
 * Connection/auth resolution lives in {@link resolveInstanceWsConnection}; auth
 * is sent as the first frame (see `wire.ts`). This component owns only the
 * xterm ↔ socket wiring and lifecycle.
 */
export function TerminalView({ entityId }: { entityId: EntityIds }) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const [status, setStatus] = useState<Status>('connecting');
	const [detail, setDetail] = useState('');
	// Bump to force the effect to tear down and reconnect.
	const [reconnectNonce, setReconnectNonce] = useState(0);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) { return; }

		const term = new Terminal({
			cursorBlink: true,
			fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace',
			fontSize: 13,
			theme: { background: '#0b0f19' },
		});
		const fit = new FitAddon();
		term.loadAddon(fit);
		term.open(container);
		const safeFit = () => {
			try {
				fit.fit();
			} catch {
				// container not laid out yet; the ResizeObserver will refit
			}
		};
		safeFit();

		setStatus('connecting');
		setDetail('');

		let ws: WebSocket;
		let auth;
		try {
			const resolved = resolveInstanceWsConnection({ id: entityId });
			auth = resolved.auth;
			if (!auth) {
				throw new Error('No operation token or stored credentials for this instance.');
			}
			ws = new WebSocket(resolved.url, resolved.protocols);
		} catch (err) {
			setStatus('error');
			setDetail(err instanceof Error ? err.message : String(err));
			term.dispose();
			return;
		}

		let authed = false;
		const sendResize = () => {
			if (ws.readyState === WebSocket.OPEN && authed) {
				ws.send(encodeResize(term.cols, term.rows));
			}
		};

		ws.onopen = () => {
			// First-message auth: the socket is unauthenticated until the server
			// accepts this frame. We flip to 'open' when the first byte comes back.
			setStatus('authenticating');
			ws.send(encodeAuth(auth));
		};
		ws.onmessage = (ev) => {
			if (!authed) {
				authed = true;
				setStatus('open');
				sendResize();
				term.focus();
			}
			if (typeof ev.data === 'string') {
				term.write(ev.data);
			} else if (ev.data instanceof ArrayBuffer) {
				term.write(new Uint8Array(ev.data));
			}
			// Server sends text frames; Blob path intentionally unhandled.
		};
		ws.onerror = () => setStatus('error');
		ws.onclose = (ev) => {
			setStatus('closed');
			setDetail(ev.reason ? `${ev.code} ${ev.reason}` : `code ${ev.code}`);
			term.write(`\r\n\x1b[90m[connection closed${ev.reason ? `: ${ev.reason}` : ''}]\x1b[0m\r\n`);
		};

		const onData = term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN && authed) {
				ws.send(encodeInput(data));
			}
		});
		const onResize = term.onResize(() => sendResize());

		const observer = new ResizeObserver(() => safeFit());
		observer.observe(container);

		return () => {
			observer.disconnect();
			onData.dispose();
			onResize.dispose();
			try {
				ws.close(1000, 'client navigating away');
			} catch {
				// already closing
			}
			term.dispose();
		};
	}, [entityId, reconnectNonce]);

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-center gap-2 text-sm">
				<StatusDot status={status} />
				<span className="text-muted-foreground">
					{labelFor(status)}
					{detail && status !== 'open' ? ` — ${detail}` : ''}
				</span>
				{(status === 'closed' || status === 'error') && (
					<Button
						size="sm"
						variant="outline"
						onClick={() => setReconnectNonce((n) => n + 1)}
					>
						Reconnect
					</Button>
				)}
			</div>
			<div
				ref={containerRef}
				className="h-[70vh] w-full overflow-hidden rounded-md border bg-[#0b0f19] p-2"
			/>
		</div>
	);
}

function labelFor(status: Status): string {
	switch (status) {
		case 'open':
			return 'Connected';
		case 'connecting':
			return 'Connecting…';
		case 'authenticating':
			return 'Authenticating…';
		case 'error':
			return 'Error';
		case 'closed':
			return 'Disconnected';
	}
}

function StatusDot({ status }: { status: Status }) {
	const color = status === 'open'
		? 'bg-green-500'
		: status === 'connecting' || status === 'authenticating'
		? 'bg-yellow-500'
		: 'bg-red-500';
	return <span className={`inline-block size-2 rounded-full ${color}`} />;
}
