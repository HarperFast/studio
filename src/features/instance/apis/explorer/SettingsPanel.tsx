import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ApiAuth } from '@/features/instance/apis/explorer/request';
import { ServerOption } from '@/features/instance/apis/explorer/spec';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { cn } from '@/lib/cn';
import { CopyIcon } from 'lucide-react';

/** Which explicit-header auth forms to offer, derived from the spec's declared security schemes. */
function availableHeaderAuth(spec: OpenApiSpec | undefined): { basic: boolean; bearer: boolean } {
	const schemes = Object.values(spec?.components?.securitySchemes ?? {});
	let basic = false;
	let bearer = false;
	for (const scheme of schemes) {
		const kind = scheme?.scheme?.toLowerCase();
		if (kind === 'basic') {
			basic = true;
		}
		if (kind === 'bearer' || scheme?.type === 'oauth2') {
			bearer = true;
		}
	}
	// Fall back to offering both when the spec declares no recognizable schemes, so the user is never
	// left without a way to send an explicit Authorization header.
	if (!basic && !bearer) {
		return { basic: true, bearer: true };
	}
	return { basic, bearer };
}

/**
 * The Server + Authorization settings, shown in the detail pane when the sidebar's "Authorize" item
 * is selected. Auth is edited live (no Apply step): picking a type or typing a credential updates the
 * shared auth state immediately. Selections persist per instance in the browser's localStorage.
 */
export function SettingsPanel({
	spec,
	auth,
	onAuthChange,
	serverOptions,
	activeServer,
	onServerChange,
	onCopyServer,
}: {
	spec: OpenApiSpec | undefined;
	auth: ApiAuth;
	onAuthChange: (auth: ApiAuth) => void;
	serverOptions: ServerOption[];
	activeServer: string | undefined;
	onServerChange: (url: string) => void;
	onCopyServer: () => void;
}) {
	const available = availableHeaderAuth(spec);
	const username = auth.type === 'basic' ? auth.username : '';
	const password = auth.type === 'basic' ? auth.password : '';
	const token = auth.type === 'bearer' ? auth.token : '';

	return (
		<div className="flex max-w-2xl flex-col gap-8">
			<section className="flex flex-col gap-3">
				<div>
					<h2 className="text-lg font-medium">Server</h2>
					<p className="text-muted-foreground text-sm">The base URL that &quot;Try it out&quot; requests target.</p>
				</div>
				<ServerControl
					options={serverOptions}
					value={activeServer}
					onChange={onServerChange}
					onCopy={onCopyServer}
				/>
			</section>

			<section className="flex flex-col gap-3">
				<div>
					<h2 className="text-lg font-medium">Authorization</h2>
					<p className="text-muted-foreground text-sm">
						How &quot;Try it out&quot; requests authenticate. Selections are saved in this browser for this instance.
					</p>
				</div>

				<div className="flex flex-wrap gap-2">
					<AuthTypeButton active={auth.type === 'cookie'} onClick={() => onAuthChange({ type: 'cookie' })}>
						Cookie
					</AuthTypeButton>
					{available.basic && (
						<AuthTypeButton
							active={auth.type === 'basic'}
							onClick={() => onAuthChange({ type: 'basic', username, password })}
						>
							Basic
						</AuthTypeButton>
					)}
					{available.bearer && (
						<AuthTypeButton
							active={auth.type === 'bearer'}
							onClick={() => onAuthChange({ type: 'bearer', token })}
						>
							Bearer token
						</AuthTypeButton>
					)}
				</div>

				{auth.type === 'cookie' && (
					<p className="text-muted-foreground max-w-prose text-sm">
						Requests are sent with your browser&apos;s instance session cookie (<code>
							credentials: &quot;include&quot;
						</code>). Use this when you&apos;re already signed in to this instance — no extra credentials needed.
					</p>
				)}

				{auth.type === 'basic' && (
					<div className="flex max-w-sm flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="api-auth-username">Username</Label>
							<Input
								id="api-auth-username"
								value={username}
								autoComplete="username"
								onChange={e => onAuthChange({ type: 'basic', username: e.target.value, password })}
							/>
						</div>
						<div className="flex flex-col gap-1.5">
							<Label htmlFor="api-auth-password">Password</Label>
							<Input
								id="api-auth-password"
								type="password"
								value={password}
								autoComplete="current-password"
								onChange={e => onAuthChange({ type: 'basic', username, password: e.target.value })}
							/>
						</div>
					</div>
				)}

				{auth.type === 'bearer' && (
					<div className="flex max-w-sm flex-col gap-1.5">
						<Label htmlFor="api-auth-token">Token</Label>
						<Input
							id="api-auth-token"
							value={token}
							placeholder="eyJhbGciOi…"
							onChange={e => onAuthChange({ type: 'bearer', token: e.target.value })}
						/>
					</div>
				)}
			</section>
		</div>
	);
}

/** Server picker: a labeled `Select` when more than one server is available, else a static URL. */
function ServerControl({
	options,
	value,
	onChange,
	onCopy,
}: {
	options: ServerOption[];
	value: string | undefined;
	onChange: (url: string) => void;
	onCopy: () => void;
}) {
	if (options.length === 0) {
		return <p className="text-muted-foreground text-sm">No server URL could be determined for this instance.</p>;
	}
	if (options.length === 1) {
		return (
			<div className="flex items-center gap-1 text-sm">
				<span className="font-mono break-all">{options[0].url}</span>
				<Button
					type="button"
					variant="ghost"
					size="icon"
					aria-label="Copy server URL"
					className="size-6"
					onClick={onCopy}
				>
					<CopyIcon className="size-3" />
				</Button>
			</div>
		);
	}
	return (
		<div className="flex items-center gap-1.5">
			<Select value={value} onValueChange={onChange}>
				<SelectTrigger className="max-w-md min-w-0 flex-1" aria-label="Server">
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					{options.map(option => (
						<SelectItem key={option.url} value={option.url}>
							<span className="font-mono text-xs">{option.url}</span>
							<span className="text-muted-foreground text-xs">— {option.label}</span>
						</SelectItem>
					))}
				</SelectContent>
			</Select>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				aria-label="Copy server URL"
				className="size-6"
				onClick={onCopy}
			>
				<CopyIcon className="size-3" />
			</Button>
		</div>
	);
}

function AuthTypeButton(
	{ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode },
) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'rounded-md border px-3 py-1.5 text-sm transition-colors',
				active
					? 'border-primary bg-primary/10 text-foreground'
					: 'border-border text-muted-foreground hover:bg-accent/60',
			)}
		>
			{children}
		</button>
	);
}
