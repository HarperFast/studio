import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InstanceClientIdConfig, InstanceTypeConfig } from '@/config/instanceClientConfig';
import { ModelKind, StoredRecord } from '@/integrations/api/instance/models/models';
import { stableJson } from '@/lib/stableJson';
import { describeError } from '@/react-query/queryClient';
import { Save, TriangleAlertIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';
import { toast } from 'sonner';
import {
	BACKEND_FIELDS,
	BACKENDS_BY_KIND,
	buildModelEntry,
	emptyModelForm,
	hidesUrlCredentials,
	KIND_LABELS,
	ModelForm,
	modelFormFromEntry,
	modelNames,
	validateModelForm,
} from './modelEntries';
import { ModelSaveOutcome } from './saveModelChange';
import { useSaveModelChange } from './useSaveModelChange';

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-card px-3 text-sm';

const BACKEND_LABELS: Record<string, string> = {
	ollama: 'Ollama',
	openai: 'OpenAI, or any service that speaks its API',
	anthropic: 'Anthropic',
	bedrock: 'Amazon Bedrock',
	generative: 'A generative model',
};

export type ModelDialogTarget =
	| { mode: 'add' }
	| { mode: 'edit'; kind: ModelKind; name: string; stored: StoredRecord; keyNote?: string };

export function ModelDialog({ target, block, kinds, instanceParams, fabricKeys, onClose, onSaved }: {
	target: ModelDialogTarget;
	block: StoredRecord | undefined;
	kinds: readonly ModelKind[];
	instanceParams: InstanceClientIdConfig & InstanceTypeConfig;
	fabricKeys: ReadonlySet<string> | undefined;
	onClose: () => void;
	onSaved: (outcome: ModelSaveOutcome, model: { kind: ModelKind; name: string }) => void;
}) {
	const stored = target.mode === 'edit' ? target.stored : undefined;
	const [form, setForm] = useState<ModelForm>(() =>
		target.mode === 'edit' ? modelFormFromEntry(target.kind, target.name, target.stored) : emptyModelForm(kinds[0])
	);
	const [problem, setProblem] = useState<string>();
	const mutation = useSaveModelChange();

	const set = <K extends keyof ModelForm>(field: K, value: ModelForm[K]) => {
		setForm((current) => ({ ...current, [field]: value }));
	};
	const fields = BACKEND_FIELDS[form.backend] ?? [];
	const label = KIND_LABELS[form.kind].one;
	const hiddenSignIn = (field: 'baseUrl' | 'host') =>
		stored !== undefined && stored.backend === form.backend && hidesUrlCredentials(stored[field])
			? " The saved address includes a sign-in that isn't shown. Changing the address replaces it."
			: '';
	const generativeNames = modelNames(block, 'generative');
	const generativeChoices = form.generative === '' || generativeNames.includes(form.generative)
		? generativeNames
		: [...generativeNames, form.generative];

	const submit = () => {
		const invalid = validateModelForm(form, { block, stored });
		setProblem(invalid);
		if (invalid) {
			return;
		}
		const entry = buildModelEntry(form, stored);
		if (stored && stableJson(entry) === stableJson(stored)) {
			toast.info('No changes to save');
			onClose();
			return;
		}
		mutation.mutate(
			{ params: instanceParams, change: { kind: form.kind, name: form.name, entry, loaded: stored }, fabricKeys },
			{ onSuccess: (outcome) => onSaved(outcome, { kind: form.kind, name: form.name }) },
		);
	};

	const failure = problem ?? (mutation.error != null ? describeError(mutation.error).message : undefined);

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>
						{target.mode === 'edit' ? `Edit the ${label} model '${target.name}'` : 'Add a model'}
					</DialogTitle>
					<DialogDescription>
						Saved to Harper's settings on every running instance. Harper picks the change up without a restart.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-4"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					{target.mode === 'add' && (
						<>
							<Field id="model-kind" label="Kind" hint={KIND_LABELS[form.kind].purpose}>
								<select
									id="model-kind"
									className={SELECT_CLASS}
									value={form.kind}
									onChange={(event) => {
										const kind = event.target.value as ModelKind;
										setForm((current) => ({ ...current, kind, backend: BACKENDS_BY_KIND[kind][0] }));
									}}
								>
									{kinds.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind].one}</option>)}
								</select>
							</Field>
							<Field
								id="model-name"
								label="Name"
								hint="What apps call it. An app that names no model uses the one called default."
							>
								<Input
									id="model-name"
									autoComplete="off"
									placeholder="default"
									value={form.name}
									onChange={(event) => set('name', event.target.value)}
								/>
							</Field>
						</>
					)}

					{form.kind !== 'decision' && (
						<Field id="model-backend" label="Backend">
							<select
								id="model-backend"
								className={SELECT_CLASS}
								value={form.backend}
								onChange={(event) => set('backend', event.target.value)}
							>
								{BACKENDS_BY_KIND[form.kind].map((backend) => (
									<option key={backend} value={backend}>{BACKEND_LABELS[backend]}</option>
								))}
							</select>
						</Field>
					)}

					{fields.includes('model') && (
						<Field id="model-model" label="Model" hint="The model's id, as the provider names it.">
							<Input
								id="model-model"
								autoComplete="off"
								value={form.model}
								onChange={(event) =>
									set('model', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('apiKey') && (
						<Field
							id="model-api-key"
							label="API key"
							hint={stored && stored.backend === form.backend && typeof stored.apiKey === 'string'
								? `${target.mode === 'edit' && target.keyNote ? `${target.keyNote}. ` : ''}Leave this empty to keep it.`
								: 'Paste the key, or enter a placeholder such as ${OPENAI_API_KEY} to read it from the '
									+ "instance's environment, where it must already be set. A saved key is never shown again."}
						>
							<Input
								id="model-api-key"
								type="password"
								autoComplete="new-password"
								value={form.apiKey}
								onChange={(event) => set('apiKey', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('baseUrl') && (
						<Field
							id="model-base-url"
							label="Base URL (optional)"
							hint={`Leave empty for the provider's own address.${hiddenSignIn('baseUrl')}`}
						>
							<Input
								id="model-base-url"
								autoComplete="off"
								placeholder="https://"
								value={form.baseUrl}
								onChange={(event) => set('baseUrl', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('organization') && (
						<Field id="model-organization" label="Organization (optional)">
							<Input
								id="model-organization"
								autoComplete="off"
								value={form.organization}
								onChange={(event) => set('organization', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('host') && (
						<Field
							id="model-host"
							label="Host (optional)"
							hint={`Leave empty for localhost:11434.${hiddenSignIn('host')}`}
						>
							<Input
								id="model-host"
								autoComplete="off"
								value={form.host}
								onChange={(event) => set('host', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('region') && (
						<Field
							id="model-region"
							label="Region (optional)"
							hint="Leave empty to use the instance's AWS_REGION. Credentials come from the instance's AWS environment."
						>
							<Input
								id="model-region"
								autoComplete="off"
								value={form.region}
								onChange={(event) => set('region', event.target.value)}
							/>
						</Field>
					)}

					{fields.includes('generative') && (
						<Field
							id="model-generative"
							label="Generative model"
							hint={generativeChoices.length === 0
								? 'A decision model decides with a generative model. Add one first.'
								: 'The generative model that makes the decision.'}
						>
							<select
								id="model-generative"
								className={SELECT_CLASS}
								disabled={generativeChoices.length === 0}
								value={form.generative || 'default'}
								onChange={(event) => set('generative', event.target.value)}
							>
								{form.generative === '' && !generativeNames.includes('default') && (
									<option value="">Choose a generative model</option>
								)}
								{generativeChoices.map((name) => <option key={name} value={name}>{name}</option>)}
							</select>
						</Field>
					)}

					<Field
						id="model-fallback"
						label="Fallback models (optional)"
						hint={`Other ${label} models to try, in order, when this one fails. Separate names with commas.`}
					>
						<Input
							id="model-fallback"
							autoComplete="off"
							value={form.fallback}
							onChange={(event) => set('fallback', event.target.value)}
						/>
					</Field>

					{failure && (
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertDescription>{failure}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="submit" disabled={mutation.isPending}>
							<Save />
							{mutation.isPending ? 'Saving…' : target.mode === 'edit' ? 'Save Model' : 'Add Model'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
		</div>
	);
}
