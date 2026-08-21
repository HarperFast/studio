import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApiAuth, AuthMethod } from '@/features/instance/apis/explorer/request';
import { ServerOption } from '@/features/instance/apis/explorer/spec';
import { OpenApiSpec } from '@/features/instance/apis/explorer/types';
import { cn } from '@/lib/cn';
import { CopyIcon, Lock, LockOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface LoginController {
	status: 'idle' | 'pending' | 'error';
	error: string | null;
	runSession: () => void;
	// Null when no direct instance URL can be proven, which hides the credential form.
	runCredentials: ((credentials: { username: string; password: string }) => void) | null;
}

/** Which explicit-header auth forms to offer, derived from the spec's declared security schemes. */
function availableHeaderAuth(spec: OpenApiSpec | undefined): { basic: boolean; bearer: boolean } {
	const schemes = Object.values(spec?.components?.securitySchemes ?? {});
	let basic = false;
	let bearer = false;
	for (const scheme of schemes) {
		const kind = typeof scheme?.scheme === 'string' ? scheme.scheme.toLowerCase() : undefined;
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
 * is selected. Authorization is split into Documentation (what each method is and when to use it) and
 * "Try it out" (the interactive log-in / credential entry that unlocks authenticated requests).
 * Selections persist per instance in this browser tab's session storage.
 */
export function SettingsPanel({
	spec,
	method,
	auth,
	authorized,
	tab,
	onTabChange,
	onSelectMethod,
	onApplyBasic,
	onApplyBearer,
	onClearAuth,
	login,
	serverOptions,
	activeServer,
	onServerChange,
	onCopyServer,
}: {
	spec: OpenApiSpec | undefined;
	method: AuthMethod;
	auth: ApiAuth;
	authorized: boolean;
	tab: 'docs' | 'try';
	onTabChange: (tab: 'docs' | 'try') => void;
	onSelectMethod: (method: AuthMethod) => void;
	onApplyBasic: (username: string, password: string) => void;
	onApplyBearer: (token: string) => void;
	onClearAuth: () => void;
	login: LoginController;
	serverOptions: ServerOption[];
	activeServer: string | undefined;
	onServerChange: (url: string) => void;
	onCopyServer: () => void;
}) {
	const available = availableHeaderAuth(spec);

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
				<div className="flex items-center gap-2">
					{authorized
						? <Lock className="text-green size-4" />
						: <LockOpen className="text-muted-foreground size-4" />}
					<h2 className="text-lg font-medium">Authorization</h2>
				</div>

				<Tabs value={tab} onValueChange={value => onTabChange(value as 'docs' | 'try')} className="gap-4">
					<TabsList>
						<TabsTrigger value="docs">Documentation</TabsTrigger>
						<TabsTrigger value="try">Try it out</TabsTrigger>
					</TabsList>

					<TabsContent value="docs">
						<AuthorizationDocs available={available} />
					</TabsContent>

					<TabsContent value="try" className="flex flex-col gap-4">
						<MethodSelector method={method} available={available} onSelect={onSelectMethod} />
						{authorized && (
							<div className="border-green/40 bg-green/10 text-foreground flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
								<Lock className="text-green size-4" />
								<span className="flex-1">Credential set — &quot;Try it out&quot; requests will send it.</span>
								<Button type="button" variant="outline" size="sm" onClick={onClearAuth}>Clear</Button>
							</div>
						)}
						{method === 'login' && <LoginForm login={login} authorized={authorized} />}
						{method === 'basic' && <BasicForm auth={auth} onApply={onApplyBasic} />}
						{method === 'bearer' && <BearerForm auth={auth} onApply={onApplyBearer} />}
						{method === 'cookie' && <CookieNotice />}
					</TabsContent>
				</Tabs>
			</section>
		</div>
	);
}

function AuthorizationDocs({ available }: { available: { basic: boolean; bearer: boolean } }) {
	return (
		<div className="text-muted-foreground flex max-w-prose flex-col gap-4 text-sm">
			<p>
				How &quot;Try it out&quot; requests authenticate. Your selection is saved in this browser tab only (session
				storage) and cleared when the tab closes.
			</p>
			<dl className="flex flex-col gap-3">
				<div>
					<dt className="text-foreground font-medium">Log in (recommended)</dt>
					<dd>
						Exchanges your current Studio session — or a username and password — for a short-lived Bearer token, sent as
						an <code>Authorization</code>{' '}
						header. This works even when the instance is on a different site than Studio and cookies aren&apos;t sent.
						Only the minted token is stored, never your password.
					</dd>
				</div>
				{available.basic && (
					<div>
						<dt className="text-foreground font-medium">Basic</dt>
						<dd>
							Sends your username and password as an <code>Authorization: Basic</code>{' '}
							header on every request. The username and password are stored in this browser tab until it closes.
						</dd>
					</div>
				)}
				{available.bearer && (
					<div>
						<dt className="text-foreground font-medium">Bearer token</dt>
						<dd>
							Paste an existing operation token; it&apos;s sent as an <code>Authorization: Bearer</code> header.
						</dd>
					</div>
				)}
				<div>
					<dt className="text-foreground font-medium">Cookie</dt>
					<dd>
						Relies on your browser&apos;s instance session cookie (<code>credentials: &quot;include&quot;</code>).
						Whether the cookie is sent depends on how the instance is deployed relative to Studio (same site, cookie
						attributes, HTTPS), so it often won&apos;t work in a deployed environment — prefer Log in there.
					</dd>
				</div>
			</dl>
		</div>
	);
}

function MethodSelector({
	method,
	available,
	onSelect,
}: {
	method: AuthMethod;
	available: { basic: boolean; bearer: boolean };
	onSelect: (method: AuthMethod) => void;
}) {
	return (
		<div className="flex flex-wrap gap-2">
			<AuthTypeButton active={method === 'login'} onClick={() => onSelect('login')}>Log in</AuthTypeButton>
			{available.basic && (
				<AuthTypeButton active={method === 'basic'} onClick={() => onSelect('basic')}>Basic</AuthTypeButton>
			)}
			{available.bearer && (
				<AuthTypeButton active={method === 'bearer'} onClick={() => onSelect('bearer')}>Bearer token</AuthTypeButton>
			)}
			<AuthTypeButton active={method === 'cookie'} onClick={() => onSelect('cookie')}>Cookie</AuthTypeButton>
		</div>
	);
}

function LoginForm({ login, authorized }: { login: LoginController; authorized: boolean }) {
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const pending = login.status === 'pending';

	// Drop the typed credentials once a mint from them succeeds (pending → idle). Keyed on the status
	// transition, not the `authorized` boolean, so re-authenticating while already authorized (where
	// `authorized` never changes) still clears the password from memory.
	const prevStatus = useRef(login.status);
	useEffect(() => {
		if (prevStatus.current === 'pending' && login.status === 'idle') {
			setUsername('');
			setPassword('');
		}
		prevStatus.current = login.status;
	}, [login.status]);

	return (
		<div className="flex max-w-sm flex-col gap-4">
			<div className="flex flex-col gap-1.5">
				<Button type="button" variant="submit" disabled={pending} onClick={login.runSession}>
					{pending ? 'Authorizing…' : 'Authorize with your current session'}
				</Button>
				<span className="text-muted-foreground text-xs">
					Mints a token as the user you&apos;re signed in to Studio as — no credentials to retype.
				</span>
			</div>

			{login.runCredentials && (
				<form
					className="flex flex-col gap-3"
					onSubmit={event => {
						event.preventDefault();
						login.runCredentials?.({ username, password });
					}}
				>
					<span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
						Or use different credentials
					</span>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="api-login-username">Username</Label>
						<Input
							id="api-login-username"
							value={username}
							autoComplete="username"
							onChange={e => setUsername(e.target.value)}
						/>
					</div>
					<div className="flex flex-col gap-1.5">
						<Label htmlFor="api-login-password">Password</Label>
						<Input
							id="api-login-password"
							type="password"
							value={password}
							autoComplete="current-password"
							onChange={e => setPassword(e.target.value)}
						/>
					</div>
					<Button type="submit" variant="outline" disabled={pending || !username || !password}>
						{pending ? 'Authorizing…' : 'Authorize'}
					</Button>
				</form>
			)}

			{login.status === 'error' && login.error && <p className="text-red text-sm">{login.error}</p>}
			{!authorized && login.status === 'idle' && (
				<p className="text-muted-foreground text-xs">Not signed in — authenticated requests will be rejected.</p>
			)}
		</div>
	);
}

function BasicForm({ auth, onApply }: { auth: ApiAuth; onApply: (username: string, password: string) => void }) {
	const [username, setUsername] = useState(auth.type === 'basic' ? auth.username : '');
	const [password, setPassword] = useState(auth.type === 'basic' ? auth.password : '');
	// Resync when the applied credential changes underneath the form (e.g. Clear empties it), so a
	// cleared password doesn't linger in the input and get resubmitted.
	useEffect(() => {
		setUsername(auth.type === 'basic' ? auth.username : '');
		setPassword(auth.type === 'basic' ? auth.password : '');
	}, [auth]);
	return (
		<form
			className="flex max-w-sm flex-col gap-3"
			onSubmit={event => {
				event.preventDefault();
				onApply(username, password);
			}}
		>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="api-auth-username">Username</Label>
				<Input
					id="api-auth-username"
					value={username}
					autoComplete="username"
					onChange={e => setUsername(e.target.value)}
				/>
			</div>
			<div className="flex flex-col gap-1.5">
				<Label htmlFor="api-auth-password">Password</Label>
				<Input
					id="api-auth-password"
					type="password"
					value={password}
					autoComplete="current-password"
					onChange={e => setPassword(e.target.value)}
				/>
			</div>
			<Button type="submit" variant="outline" disabled={!username}>Authorize</Button>
		</form>
	);
}

function BearerForm({ auth, onApply }: { auth: ApiAuth; onApply: (token: string) => void }) {
	const [token, setToken] = useState(auth.type === 'bearer' ? auth.token : '');
	// Resync when the applied token changes underneath the form (e.g. Clear empties it).
	useEffect(() => {
		setToken(auth.type === 'bearer' ? auth.token : '');
	}, [auth]);
	return (
		<form
			className="flex max-w-sm flex-col gap-1.5"
			onSubmit={event => {
				event.preventDefault();
				onApply(token);
			}}
		>
			<Label htmlFor="api-auth-token">Token</Label>
			<Input id="api-auth-token" value={token} placeholder="eyJhbGciOi…" onChange={e => setToken(e.target.value)} />
			<Button type="submit" variant="outline" className="mt-2" disabled={!token}>Authorize</Button>
		</form>
	);
}

function CookieNotice() {
	return (
		<p className="text-muted-foreground max-w-prose text-sm">
			Requests are sent with your browser&apos;s instance session cookie (<code>
				credentials: &quot;include&quot;
			</code>). Whether it&apos;s sent depends on how the instance is deployed relative to Studio, so it often
			won&apos;t work in a deployed environment — use Log in if requests come back unauthorized.
		</p>
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
