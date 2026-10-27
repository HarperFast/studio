import { checkPageRequest, getTableCapabilities } from '@/features/instance/extensions/access';
import type { ExtensionDataSource } from '@/features/instance/extensions/dataSource';
import type {
	ExtensionRequest,
	FrameContent as FrameContentManifest,
	ResolvedExtensionPage,
} from '@/features/instance/extensions/manifest';
import { parseRequest } from '@/features/instance/extensions/parseStudioConfiguration';
import { useResolvedTheme } from '@/hooks/useResolvedTheme';
import type { LocalRolePermission } from '@/integrations/api/api.patch';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/** The tokens a framed page receives so it can match Studio's look in either theme. */
const THEME_TOKENS = [
	'--background',
	'--foreground',
	'--card',
	'--card-foreground',
	'--primary',
	'--primary-foreground',
	'--muted',
	'--muted-foreground',
	'--accent',
	'--border',
	'--destructive',
	'--radius',
];

function readThemeTokens(): Record<string, string> {
	const style = getComputedStyle(document.documentElement);
	return Object.fromEntries(THEME_TOKENS.map((token) => [token, style.getPropertyValue(token).trim()]));
}

type FrameMessage =
	| { type: 'studio:request'; id: number; request: ExtensionRequest }
	| { type: 'studio:toast'; message: string; variant?: 'success' | 'error' | 'info' }
	| { type: 'studio:resize'; height: number };

/**
 * A page the component draws itself. The iframe is sandboxed without `allow-same-origin`, so it runs
 * in an opaque origin: it can't read Studio's storage, cookies or DOM, and holds no credential. All it
 * can do is ask, over postMessage, and Studio sends only requests the page declared and the viewer's
 * role allows (`checkPageRequest`), with the viewer's own credentials.
 *
 * Protocol (v1): Studio → frame `studio:init` {theme, user, access} and `studio:theme` on a theme
 * change, `studio:response` {id, ok, data | error}; frame → Studio `studio:request` {id, request},
 * `studio:toast` {message, variant}, `studio:resize` {height}.
 */
export function FrameContent({ page, content, dataSource, permission, restUrl }: {
	page: ResolvedExtensionPage;
	content: FrameContentManifest;
	dataSource: ExtensionDataSource;
	permission: LocalRolePermission | undefined;
	restUrl: string | null;
}) {
	const frameRef = useRef<HTMLIFrameElement>(null);
	const [height, setHeight] = useState(content.minHeight ?? 480);
	const theme = useResolvedTheme();

	// Read through a ref so a role or theme change doesn't tear down the listener mid-request.
	const latest = useRef({ page, dataSource, permission });
	latest.current = { page, dataSource, permission };

	useEffect(() => {
		const post = (message: unknown) => frameRef.current?.contentWindow?.postMessage(message, '*');
		const onMessage = async (event: MessageEvent) => {
			// The sandboxed frame's origin is the opaque "null", so identify it by its window instead.
			if (event.source !== frameRef.current?.contentWindow) {
				return;
			}
			const message = event.data as FrameMessage;
			switch (message?.type) {
				case 'studio:resize':
					setHeight(Math.max(content.minHeight ?? 0, Math.min(Number(message.height) || 0, 4000)));
					return;
				case 'studio:toast': {
					const text = String(message.message).slice(0, 200);
					if (message.variant === 'error') {
						toast.error(text);
					} else if (message.variant === 'success') {
						toast.success(text);
					} else {
						toast(text);
					}
					return;
				}
				case 'studio:request': {
					const { page, dataSource, permission } = latest.current;
					const request = parseRequest(message.request);
					if (!request) {
						post({ type: 'studio:response', id: message.id, ok: false, error: 'not an operation or a REST call' });
						return;
					}
					const verdict = checkPageRequest(permission, page.access, request);
					if (!verdict.allowed) {
						post({ type: 'studio:response', id: message.id, ok: false, error: verdict.reason });
						return;
					}
					try {
						const data = await dataSource.send(request);
						post({ type: 'studio:response', id: message.id, ok: true, data });
					} catch (error) {
						post({ type: 'studio:response', id: message.id, ok: false, error: (error as Error).message });
					}
					return;
				}
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	}, [content.minHeight]);

	const onLoad = () => {
		const { page, permission } = latest.current;
		frameRef.current?.contentWindow?.postMessage({
			type: 'studio:init',
			protocol: 1,
			page: { key: page.key, name: page.name },
			theme: { mode: theme, tokens: readThemeTokens() },
			// Role facts only, never the username: on Fabric Connect it is an email address, and a framed page can
			// send anything it holds anywhere.
			user: { superUser: permission?.super_user === true },
			access: Object.fromEntries(
				(page.access?.tables ?? []).map((grant) => [
					`${grant.database}.${grant.table}`,
					getTableCapabilities(permission, grant.database, grant.table),
				]),
			),
		}, '*');
	};

	useEffect(() => {
		frameRef.current?.contentWindow?.postMessage({ type: 'studio:theme', mode: theme, tokens: readThemeTokens() }, '*');
	}, [theme]);

	const src = content.srcdoc
		? undefined
		: content.path && restUrl
		? new URL(content.path, restUrl).toString()
		: undefined;
	return (
		<iframe
			ref={frameRef}
			title={page.name}
			sandbox="allow-scripts allow-forms"
			srcDoc={content.srcdoc}
			src={src}
			onLoad={onLoad}
			className="w-full rounded-md border border-border bg-card"
			style={{ height }}
		/>
	);
}
