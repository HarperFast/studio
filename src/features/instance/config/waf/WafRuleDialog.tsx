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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useInstanceClientIdParams } from '@/config/useInstanceClient';
import { STRING_OP_LABELS } from '@/features/instance/config/waf/describeWafRule';
import {
	buildWafRule,
	emptyNamedValueRow,
	emptyWafRuleForm,
	NamedValueRow,
	newWafRule,
	WafRuleFormErrors,
	WafRuleFormValues,
	wafRuleFormValues,
	wafRuleIdError,
	wafRulePatch,
} from '@/features/instance/config/waf/wafRuleForm';
import {
	useAddWafRule,
	useEditWafRule,
	WAF_STRING_OPS,
	WafAction,
	WafRule,
	wafRuleDeferrals,
	WafStringOp,
} from '@/integrations/api/instance/waf/waf';
import { describeError } from '@/react-query/queryClient';
import { PlusIcon, Save, TriangleAlertIcon, XIcon } from 'lucide-react';
import { ReactNode, useState } from 'react';

const SELECT_CLASS = 'h-9 rounded-md border border-input bg-card px-3 text-sm';

const ACTION_CHOICES: Array<{ value: WafAction; label: string }> = [
	{ value: 'block', label: 'Block the request' },
	{ value: 'log', label: 'Log the match and let it through' },
	{ value: 'score', label: 'Add to the request’s score' },
];

export type WafRuleDialogTarget =
	| { kind: 'add'; existingIds: ReadonlySet<string> }
	| { kind: 'edit'; rule: WafRule };

/**
 * Adds or edits one rule. Mount it only while open, keyed per target, so a reopened dialog starts from
 * the rule rather than from an abandoned draft.
 */
export function WafRuleDialog({ target, onClose, onSaved, onFailed }: {
	target: WafRuleDialogTarget;
	onClose: () => void;
	onSaved: (id: string) => void;
	/** The usual failure is that the rule changed or appeared meanwhile, so the list behind is stale. */
	onFailed: () => void;
}) {
	const instanceParams = useInstanceClientIdParams();
	const loaded = target.kind === 'edit' ? target.rule : undefined;
	const [values, setValues] = useState<WafRuleFormValues>(() =>
		loaded ? wafRuleFormValues(loaded) : emptyWafRuleForm()
	);
	const [errors, setErrors] = useState<WafRuleFormErrors>({});
	const add = useAddWafRule();
	const edit = useEditWafRule();
	const mutation = loaded ? edit : add;
	const deferrals = loaded ? wafRuleDeferrals(loaded) : [];

	const set = <K extends keyof WafRuleFormValues>(field: K, value: WafRuleFormValues[K]) => {
		setValues((current) => ({ ...current, [field]: value }));
	};

	const submit = () => {
		const built = buildWafRule(values, loaded);
		const idError = target.kind === 'add' ? wafRuleIdError(values.id, target.existingIds) : undefined;
		const nextErrors = built.ok ? {} : { ...built.errors };
		if (idError) {
			nextErrors.id = idError;
		}
		setErrors(nextErrors);
		if (!built.ok || idError) {
			return;
		}
		if (loaded) {
			edit.mutate({ ...instanceParams, loaded, patch: wafRulePatch(loaded, built.fields) }, {
				onSuccess: () => onSaved(loaded.id),
				onError: onFailed,
			});
		} else {
			const rule = newWafRule(values.id, built.fields);
			add.mutate({ ...instanceParams, rule }, { onSuccess: () => onSaved(rule.id), onError: onFailed });
		}
	};

	// A deferred action the rule already stores stays selectable, so saving other changes keeps it.
	const actionChoices = ACTION_CHOICES.some((choice) => choice.value === values.action)
		? ACTION_CHOICES
		: [...ACTION_CHOICES, { value: values.action, label: `${values.action} (not enforced)` }];
	const watchable = values.action === 'block' || values.action === 'score';

	return (
		<Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>{loaded ? 'Edit firewall rule' : 'Add firewall rule'}</DialogTitle>
					<DialogDescription>
						Rules replicate to every node in the cluster. They filter application and REST traffic, not the Operations
						API.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex flex-col gap-6"
					noValidate
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					{deferrals.length > 0 && (
						<Alert variant="warning">
							<TriangleAlertIcon />
							<AlertDescription>
								Harper stores this rule but skips it: {deferrals.join(' ')}
							</AlertDescription>
						</Alert>
					)}

					<Section title="Rule">
						{loaded
							? (
								<p className="text-sm">
									<span className="text-muted-foreground">ID</span> <span className="font-mono">{loaded.id}</span>
								</p>
							)
							: (
								<Field id="waf-rule-id" label="ID" error={errors.id} hint="Can't be changed later.">
									<Input
										id="waf-rule-id"
										autoFocus
										placeholder="block-admin-probes"
										value={values.id}
										onChange={(event) => set('id', event.target.value)}
									/>
								</Field>
							)}
						<Field id="waf-rule-description" label="Description">
							<Input
								id="waf-rule-description"
								placeholder="What this rule catches"
								value={values.description}
								onChange={(event) => set('description', event.target.value)}
							/>
						</Field>
						<Field
							id="waf-rule-priority"
							label="Priority"
							error={errors.priority}
							hint="Lower runs first, and the first rule to block decides the response. Empty means 0."
						>
							<Input
								id="waf-rule-priority"
								inputMode="numeric"
								className="w-32"
								value={values.priority}
								onChange={(event) => set('priority', event.target.value)}
							/>
						</Field>
						<Toggle
							id="waf-rule-enabled"
							label="Enabled"
							checked={values.enabled}
							onChange={(checked) => set('enabled', checked)}
						/>
					</Section>

					<Section
						title="Conditions"
						detail="A request matches when it meets every condition filled in here."
						error={errors.match}
					>
						<Field
							id="waf-rule-ip"
							label="Client IP addresses"
							hint="Addresses or CIDR ranges, one per line. Any one matches."
						>
							<Textarea
								id="waf-rule-ip"
								rows={2}
								placeholder="203.0.113.0/24"
								value={values.ip}
								onChange={(event) => set('ip', event.target.value)}
							/>
						</Field>
						<Field id="waf-rule-methods" label="Methods" hint="Comma-separated. Any one matches.">
							<Input
								id="waf-rule-methods"
								placeholder="TRACE, TRACK"
								value={values.methods}
								onChange={(event) => set('methods', event.target.value)}
							/>
						</Field>
						<div className="grid gap-4 sm:grid-cols-3">
							<Field id="waf-rule-path-prefix" label="Path starts with">
								<Input
									id="waf-rule-path-prefix"
									placeholder="/admin/"
									value={values.pathPrefix}
									onChange={(event) => set('pathPrefix', event.target.value)}
								/>
							</Field>
							<Field id="waf-rule-path-exact" label="Path is">
								<Input
									id="waf-rule-path-exact"
									placeholder="/login"
									value={values.pathExact}
									onChange={(event) => set('pathExact', event.target.value)}
								/>
							</Field>
							<Field id="waf-rule-path-regex" label="Path matches regex">
								<Input
									id="waf-rule-path-regex"
									className="font-mono"
									placeholder="(^|/)\.env$"
									value={values.pathRegex}
									onChange={(event) => set('pathRegex', event.target.value)}
								/>
							</Field>
						</div>
						<NamedValueRows
							kind="header"
							rows={values.headers}
							error={errors.headers}
							onChange={(rows) => set('headers', rows)}
						/>
						<NamedValueRows
							kind="query parameter"
							rows={values.query}
							error={errors.query}
							onChange={(rows) => set('query', rows)}
						/>
						<p className="text-xs text-muted-foreground">
							Regexes use RE2, so backreferences and lookaround aren’t supported. Paths are decoded and normalized
							before matching.
						</p>
					</Section>

					<Section title="Action">
						<Field id="waf-rule-action" label="When a request matches">
							<select
								id="waf-rule-action"
								className={SELECT_CLASS}
								value={values.action}
								onChange={(event) => set('action', event.target.value as WafAction)}
							>
								{actionChoices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
							</select>
						</Field>
						{values.action === 'block' && (
							<Field
								id="waf-rule-block-status"
								label="Response status"
								error={errors.blockStatus}
								hint="Empty means 403."
							>
								<Input
									id="waf-rule-block-status"
									inputMode="numeric"
									className="w-32"
									placeholder="403"
									value={values.blockStatus}
									onChange={(event) => set('blockStatus', event.target.value)}
								/>
							</Field>
						)}
						{values.action === 'score' && (
							<Field
								id="waf-rule-score"
								label="Score"
								error={errors.score}
								hint="Requests are blocked once the scores of the rules they match add up to the threshold."
							>
								<Input
									id="waf-rule-score"
									inputMode="decimal"
									className="w-32"
									value={values.score}
									onChange={(event) => set('score', event.target.value)}
								/>
							</Field>
						)}
						{watchable && (
							<Toggle
								id="waf-rule-shadow"
								label="Watch only"
								hint="Logs what the rule would block, without blocking it."
								checked={values.shadow}
								onChange={(checked) => set('shadow', checked)}
							/>
						)}
					</Section>

					<Section
						title="Runs on"
						detail="Leave these empty to run the rule on every node. Each one filled in narrows it further."
					>
						<div className="grid gap-4 sm:grid-cols-3">
							<Field id="waf-rule-regions" label="Regions">
								<Input
									id="waf-rule-regions"
									placeholder="us-east, eu-west"
									value={values.regions}
									onChange={(event) => set('regions', event.target.value)}
								/>
							</Field>
							<Field id="waf-rule-tags" label="Node tags">
								<Input
									id="waf-rule-tags"
									placeholder="canary"
									value={values.tags}
									onChange={(event) => set('tags', event.target.value)}
								/>
							</Field>
							<Field id="waf-rule-nodes" label="Node names">
								<Input
									id="waf-rule-nodes"
									value={values.nodes}
									onChange={(event) => set('nodes', event.target.value)}
								/>
							</Field>
						</div>
						<p className="text-xs text-muted-foreground">
							A rule limited to a region or tag that no node has runs nowhere, and is still listed as usual.
						</p>
					</Section>

					{mutation.error != null && (
						<Alert variant="destructive">
							<TriangleAlertIcon />
							<AlertDescription>{describeError(mutation.error).message}</AlertDescription>
						</Alert>
					)}

					<DialogFooter>
						<Button type="button" variant="ghost" disabled={mutation.isPending} onClick={onClose}>
							Cancel
						</Button>
						<Button type="submit" variant="submit" disabled={mutation.isPending}>
							<Save />
							{mutation.isPending ? 'Saving…' : loaded ? 'Save Rule' : 'Add Rule'}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function Section({ title, detail, error, children }: {
	title: string;
	detail?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<fieldset className="flex flex-col gap-4">
			<legend className="mb-1 text-sm font-semibold">{title}</legend>
			{detail && <p className="-mt-2 text-sm text-muted-foreground">{detail}</p>}
			{error && <p className="-mt-2 text-sm text-destructive">{error}</p>}
			{children}
		</fieldset>
	);
}

function Field({ id, label, hint, error, children }: {
	id: string;
	label: string;
	hint?: string;
	error?: string;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<Label htmlFor={id}>{label}</Label>
			{children}
			{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			{error && <p className="text-sm text-destructive">{error}</p>}
		</div>
	);
}

function Toggle({ id, label, hint, checked, onChange }: {
	id: string;
	label: string;
	hint?: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<div className="flex items-start gap-3">
			<Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
			<div className="flex flex-col gap-1">
				<Label htmlFor={id}>{label}</Label>
				{hint && <p className="text-xs text-muted-foreground">{hint}</p>}
			</div>
		</div>
	);
}

function NamedValueRows({ kind, rows, error, onChange }: {
	kind: 'header' | 'query parameter';
	rows: NamedValueRow[];
	error?: string;
	onChange: (rows: NamedValueRow[]) => void;
}) {
	const title = kind === 'header' ? 'Headers' : 'Query parameters';
	const update = (index: number, patch: Partial<NamedValueRow>) =>
		onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
	return (
		<div className="flex flex-col gap-2">
			<span className="text-sm font-medium">{title}</span>
			{rows.map((row, index) => (
				<div key={index} className="flex flex-wrap items-center gap-2">
					<Input
						aria-label={`${kind} ${index + 1} name`}
						className="w-40"
						placeholder={kind === 'header' ? 'user-agent' : 'name'}
						value={row.name}
						onChange={(event) => update(index, { name: event.target.value })}
					/>
					<select
						aria-label={`${kind} ${index + 1} comparison`}
						className={SELECT_CLASS}
						value={row.op}
						onChange={(event) => update(index, { op: event.target.value as WafStringOp })}
					>
						{WAF_STRING_OPS.map((op) => <option key={op} value={op}>{STRING_OP_LABELS[op]}</option>)}
					</select>
					{row.op !== 'exists' && (
						<Input
							aria-label={`${kind} ${index + 1} value`}
							className={`min-w-40 flex-1 ${row.op === 'regex' ? 'font-mono' : ''}`}
							value={row.value}
							onChange={(event) => update(index, { value: event.target.value })}
						/>
					)}
					<Button
						type="button"
						size="icon"
						variant="ghost"
						aria-label={`Remove ${kind} ${index + 1}`}
						onClick={() => onChange(rows.filter((_, i) => i !== index))}
					>
						<XIcon />
					</Button>
				</div>
			))}
			{error && <p className="text-sm text-destructive">{error}</p>}
			<Button
				type="button"
				size="sm"
				variant="ghostOutline"
				className="w-fit"
				onClick={() => onChange([...rows, emptyNamedValueRow()])}
			>
				<PlusIcon /> Add {kind} condition
			</Button>
		</div>
	);
}
