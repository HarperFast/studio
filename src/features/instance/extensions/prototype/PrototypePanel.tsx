import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { ExtensionIcon } from '@/features/instance/extensions/ExtensionIcon';
import { resolveExtensionPages } from '@/features/instance/extensions/manifest';
import { DEMO_COMPONENT_LABELS, DEMO_EXTENSIONS } from '@/features/instance/extensions/prototype/demoExtensions';
import {
	FOCUS_PRESETS,
	FocusPreset,
	setPrototypeState,
	SIMULATED_ROLES,
	SimulatedRole,
	usePrototypeState,
} from '@/features/instance/extensions/prototype/prototypeState';
import { useExtensionPages } from '@/features/instance/extensions/useStudioExtensions';
import { cn } from '@/lib/cn';
import { buildAbsoluteLinkToPage } from '@/lib/urls/buildAbsoluteLinkToPage';
import { Link, useParams } from '@tanstack/react-router';
import { ChevronDownIcon, FlaskConicalIcon, LockIcon } from 'lucide-react';

const ROLE_OPTIONS: { value: SimulatedRole; label: string; description: string }[] = [
	{ value: 'actual', label: 'Your real role', description: 'whatever you signed in with' },
	...Object.entries(SIMULATED_ROLES).map(([value, role]) => ({
		value: value as SimulatedRole,
		label: role.label,
		description: role.description,
	})),
];

/**
 * PROTOTYPE ONLY: switches between the scenarios — which demo components the cluster has, and which
 * role extension pages are judged against — and lists where each page landed.
 */
export function PrototypePanel() {
	const state = usePrototypeState();
	const pages = useExtensionPages();
	const params = useParams({ strict: false });
	const open = state.panelOpen;

	return (
		<div
			className="fixed left-4 z-50 w-72 rounded-lg border border-border bg-card text-card-foreground shadow-xl text-sm"
			style={{ bottom: 'calc(16px + var(--notification-banner-height))' }}
		>
			<button
				type="button"
				className="flex w-full items-center gap-2 px-3 py-2 font-semibold"
				onClick={() => setPrototypeState({ panelOpen: !open })}
				aria-expanded={open}
			>
				<FlaskConicalIcon className="size-4 text-primary dark:text-white" />
				<span className="grow text-left">Extensions prototype</span>
				<ChevronDownIcon className={cn('size-4 transition-transform', !open && 'rotate-180')} />
			</button>
			{open && (
				<div className="border-t border-border px-3 py-3 grid gap-4 max-h-[70vh] overflow-y-auto">
					<div className="flex items-center justify-between">
						<span>Show component pages</span>
						<Switch checked={state.enabled} onCheckedChange={(enabled) => setPrototypeState({ enabled })} />
					</div>
					<fieldset className="grid gap-2" disabled={!state.enabled}>
						<legend className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
							Components on this cluster
						</legend>
						{DEMO_EXTENSIONS.map((manifest) => (
							<label key={manifest.component} className="flex items-start gap-2">
								<input
									type="checkbox"
									className="mt-1"
									checked={state.installed[manifest.component] === true}
									onChange={(event) =>
										setPrototypeState({
											installed: { ...state.installed, [manifest.component]: event.target.checked },
										})}
								/>
								<span>
									<code className="text-xs">{manifest.component}</code>
									<span className="block text-xs text-muted-foreground">
										{DEMO_COMPONENT_LABELS[manifest.component]}
									</span>
								</span>
							</label>
						))}
					</fieldset>
					<fieldset className="grid gap-2" disabled={!state.enabled}>
						<legend className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
							View component pages as
						</legend>
						{ROLE_OPTIONS.map((option) => (
							<label key={option.value} className="flex items-start gap-2">
								<input
									type="radio"
									name="prototype-role"
									className="mt-1"
									checked={state.role === option.value}
									onChange={() => setPrototypeState({ role: option.value })}
								/>
								<span>
									{option.label}
									<span className="block text-xs text-muted-foreground">{option.description}</span>
								</span>
							</label>
						))}
						<p className="text-xs text-muted-foreground">
							Built-in tabs keep your real role; only component pages use this one.
						</p>
					</fieldset>
					<fieldset className="grid gap-2" disabled={!state.enabled}>
						<legend className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
							Cluster's studio config
						</legend>
						{(Object.entries(FOCUS_PRESETS) as [FocusPreset, (typeof FOCUS_PRESETS)[FocusPreset]][]).map((
							[value, preset],
						) => (
							<label key={value} className="flex items-start gap-2">
								<input
									type="radio"
									name="prototype-focus"
									className="mt-1"
									checked={state.focus === value}
									onChange={() => setPrototypeState({ focus: value })}
								/>
								<span>
									{preset.label}
									<span className="block text-xs text-muted-foreground">{preset.description}</span>
								</span>
							</label>
						))}
						<Link to={buildAbsoluteLinkToPage(params, 'start')} className="text-xs underline text-muted-foreground">
							Enter the cluster as a new visitor would
						</Link>
					</fieldset>
					{state.enabled && (
						<div className="grid gap-1">
							<span className="text-xs uppercase tracking-wide text-muted-foreground">Where they landed</span>
							{resolveExtensionPages(DEMO_EXTENSIONS)
								.filter((page) => state.installed[page.component])
								.map((resolved) => {
									const page = pages.find((candidate) => candidate.key === resolved.key);
									const allowed = page?.verdict.allowed === true;
									const to = buildAbsoluteLinkToPage(
										params,
										resolved.placement === 'tab' ? `ext/${resolved.key}` : `config/ext/${resolved.key}`,
									);
									return (
										<Button key={resolved.key} asChild variant="ghost" size="sm" className="justify-start h-auto py-1">
											<Link to={to}>
												{allowed
													? <ExtensionIcon name={resolved.icon} className="size-4" />
													: <LockIcon className="size-4" />}
												<span className="grow text-left">
													{resolved.name}
													<span className="block text-xs text-muted-foreground font-normal">
														{resolved.placement === 'tab' ? 'Top tab' : 'Config menu'}
														{allowed ? '' : ` · hidden: needs ${page?.verdict.missing.join(', ')}`}
													</span>
												</span>
											</Link>
										</Button>
									);
								})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
