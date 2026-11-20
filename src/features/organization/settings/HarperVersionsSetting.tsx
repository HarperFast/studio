import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form/Form';
import { FormControl } from '@/components/ui/form/FormControl';
import { FormField } from '@/components/ui/form/FormField';
import { FormItem } from '@/components/ui/form/FormItem';
import { FormLabel } from '@/components/ui/form/FormLabel';
import { FormMessage } from '@/components/ui/form/FormMessage';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/config/apiClient';
import { SettingsSection } from '@/features/organization/settings/SettingsSection';
import { Organization, OrganizationHarperVersion } from '@/integrations/api/api.patch';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PencilIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';

// The same limits central manager's validatePatchOrg enforces, so a mistake is shown on the form.
const SEMVER = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/;
const ORG_HARPER_VERSIONS_MAX = 25;
const DEFAULT_EXPIRY_DAYS = 90;

const entrySchema = z.object({
	name: z
		.string()
		.trim()
		.min(1, 'Name is required')
		.max(64, 'At most 64 characters')
		.refine((name) => name.toLowerCase() !== 'stable', '"stable" is the default version\'s label'),
	version: z.string().trim().regex(SEMVER, 'A Harper version, such as 5.3.4'),
	// A date input's value: the entry stops being offered at the start of that day, UTC. Empty: no expiry.
	expires: z.string(),
});
type EntryForm = z.infer<typeof entrySchema>;

const dayInput = (time: number) => Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : '';
const blankEntry = (): EntryForm => ({
	name: '',
	version: '',
	expires: dayInput(Date.now() + DEFAULT_EXPIRY_DAYS * 86_400_000),
});

export function isExpired(entry: OrganizationHarperVersion, now = Date.now()): boolean {
	if (entry.expiresAt == null) { return false; }
	const time = Date.parse(entry.expiresAt);
	return !Number.isFinite(time) || time <= now;
}

async function patchHarperVersions(organizationId: string, harperVersions: OrganizationHarperVersion[]) {
	const { data } = await apiClient.patch(
		`/Admin/Organization/${encodeURIComponent(organizationId)}` as '/Admin/Organization/{id}',
		{ harperVersions } as never,
	);
	return data as unknown as { harperVersions?: OrganizationHarperVersion[] | null };
}

/**
 * The Harper versions offered to this organization beyond the public list (central-manager#867): staff add one, with
 * an expiry, to release an early-access build to it or keep it on an older build. Central manager lists them to the
 * organization alone and lets it deploy them until they expire. Saving replaces the whole list.
 */
export function HarperVersionsSetting(
	{ organizationId, entries }: { organizationId: string; entries: OrganizationHarperVersion[] },
) {
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<string | 'new' | null>(null);
	const form = useForm<EntryForm>({ resolver: zodResolver(entrySchema), defaultValues: blankEntry() });

	const { mutate, isPending } = useMutation({
		mutationFn: (next: OrganizationHarperVersion[]) => patchHarperVersions(organizationId, next),
		onSuccess: (_data, next) => {
			queryClient.setQueryData<Organization>(
				[organizationId],
				(organization) => organization && { ...organization, harperVersions: next },
			);
			void queryClient.invalidateQueries({ queryKey: [organizationId] });
			setEditing(null);
		},
	});

	const save = (next: OrganizationHarperVersion[], message: string) =>
		mutate(next, { onSuccess: () => toast.success(message) });

	const startEdit = (entry?: OrganizationHarperVersion) => {
		form.reset(
			entry
				? {
					name: entry.name,
					version: entry.version,
					expires: entry.expiresAt ? dayInput(Date.parse(entry.expiresAt)) : '',
				}
				: blankEntry(),
		);
		setEditing(entry?.version ?? 'new');
	};

	const onSubmit = (values: EntryForm) => {
		const entry: OrganizationHarperVersion = {
			name: values.name,
			version: values.version,
			expiresAt: values.expires ? `${values.expires}T00:00:00.000Z` : null,
		};
		const offered = entries.some((existing) => existing.version === entry.version);
		const next = offered
			? entries.map((existing) => existing.version === entry.version ? entry : existing)
			: [...entries, entry];
		if (next.length > ORG_HARPER_VERSIONS_MAX) {
			form.setError('version', {
				message: `An organization can be offered at most ${ORG_HARPER_VERSIONS_MAX} versions`,
			});
			return;
		}
		save(next, `Harper ${entry.version} is offered to this organization.`);
	};

	return (
		<SettingsSection
			title="Harper versions"
			actions={editing === null && (
				<Button variant="positiveOutline" size="sm" onClick={() => startEdit()}>
					<PlusIcon />
					Offer a version
				</Button>
			)}
		>
			<p className="mb-4 text-sm text-muted-foreground">
				Versions offered to this organization alone, beyond the public list: an early-access build, or an older build it
				stays on. Its members see them as scoped versions and may deploy them until they expire.
			</p>

			{entries.length === 0 && editing === null && (
				<p className="text-sm text-muted-foreground">This organization is offered only the public versions.</p>
			)}

			{entries.length > 0 && (
				<ul aria-label="Harper versions offered to this organization" className="divide-y rounded-lg border">
					{entries.map((entry) => (
						<li key={entry.version} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
							<div>
								<span className="font-medium">{entry.name}</span>
								<span className="ml-2 font-mono text-sm text-muted-foreground">{entry.version}</span>
								{isExpired(entry) && <Badge variant="warning" className="ml-2">Expired</Badge>}
								<p className="text-xs text-muted-foreground">
									{entry.expiresAt ? `Until ${new Date(entry.expiresAt).toUTCString()}` : 'No expiry'}
								</p>
							</div>
							<div className="flex gap-2">
								<Button
									variant="outline"
									size="sm"
									aria-label={`Edit ${entry.version}`}
									disabled={isPending}
									onClick={() =>
										startEdit(entry)}
								>
									<PencilIcon className="size-4" />
								</Button>
								<Button
									variant="outline"
									size="sm"
									aria-label={`Remove ${entry.version}`}
									disabled={isPending}
									onClick={() =>
										save(
											entries.filter((existing) =>
												existing.version !== entry.version
											),
											`Harper ${entry.version} is no longer offered to this organization.`,
										)}
								>
									<Trash2Icon className="size-4" />
								</Button>
							</div>
						</li>
					))}
				</ul>
			)}

			{editing !== null && (
				<div className="mt-4 rounded-lg border p-4">
					<div className="mb-4 flex items-center justify-between">
						<h4 className="font-medium">{editing === 'new' ? 'Offer a version' : `Edit ${editing}`}</h4>
						<button
							type="button"
							aria-label="Cancel"
							onClick={() => setEditing(null)}
							className="text-muted-foreground hover:text-foreground"
						>
							<XIcon className="size-4" />
						</button>
					</div>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="version"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Version</FormLabel>
										<FormControl>
											<Input placeholder="e.g. 5.3.4" {...field} disabled={editing !== 'new'} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Name</FormLabel>
										<FormControl>
											<Input placeholder="e.g. early access" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="expires"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Expires (UTC, start of day; empty for no expiry)</FormLabel>
										<FormControl>
											<Input type="date" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<Button type="submit" variant="positive" disabled={isPending}>
								{isPending ? 'Saving...' : 'Save'}
							</Button>
						</form>
					</Form>
				</div>
			)}
		</SettingsSection>
	);
}
