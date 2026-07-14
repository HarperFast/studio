/**
 * A browse/add/edit/delete surface for a key/value secret store, shared by the cluster-level
 * Secrets config page and the application editor's `.env` panel. The caller owns the data source
 * and persistence (injected as promises) plus the user-facing copy; this component owns the
 * table, the deliberate click-to-reveal affordance, and the add/edit dialogs.
 */
import { SimpleBrowseDataTable } from '@/components/SimpleBrowseDataTable';
import { Button } from '@/components/ui/button';
import { useRefreshClick } from '@/hooks/useRefreshClick';
import { ENV_VALUE_MASK } from '@/lib/env/envFile';
import { ColumnDef, Row } from '@tanstack/react-table';
import { EyeIcon, EyeOffIcon, PlusIcon, RefreshCwIcon, TriangleAlertIcon } from 'lucide-react';
import { MouseEvent, ReactNode, useCallback, useMemo, useState } from 'react';
import { SecretTier } from './accessExample';
import { AddSecretModal, EditSecretModal, SecretDeliveryOptions } from './SecretModals';

export interface SecretRow {
	name: string;
	/**
	 * The plaintext value, when the source can be read (older Harper `.env` files). Rendered
	 * masked with a click-to-reveal toggle. Leave undefined when values can't be read back
	 * (encrypted/protected stores) — the cell shows a plain mask.
	 */
	value?: string;
	/** A per-row caution (e.g. "encrypted under a stale key"), shown as an alert icon. */
	warning?: string;
	/**
	 * The row's delivery tier, when the store supports one (the cluster hdb_secret store): true =
	 * materialized onto `process.env` (global), false/undefined = scoped to granted apps. Only read
	 * when `delivery` is enabled.
	 */
	processEnv?: boolean;
}

export function SecretsManager({
	rows,
	isFetching,
	onRefresh,
	canManage = true,
	selectedName,
	onSelectName,
	nameHeader = 'Key',
	addDescription,
	editDescription,
	valueDescription,
	onSet,
	onDelete,
	renderEditExtras,
	docsLink,
	children,
	delivery = false,
	deliveryDefaultTier = 'scoped',
	grantableComponents,
}: {
	rows: SecretRow[];
	isFetching?: boolean;
	/** Re-load the rows; shown as a Refresh toolbar button when provided. */
	onRefresh?: () => Promise<unknown>;
	/** false renders a read-only listing: no add button, no row-click editing. */
	canManage?: boolean;
	/** Controlled selection — the named secret's edit dialog is open. */
	selectedName?: string;
	onSelectName: (name: string | undefined) => void;
	nameHeader?: string;
	addDescription: ReactNode;
	editDescription: ReactNode;
	valueDescription?: ReactNode;
	/**
	 * Persist a key/value pair — both adding a new secret and replacing an existing value. The
	 * third argument carries delivery-tier choices when `delivery` is enabled (ignored otherwise).
	 */
	onSet: (key: string, value: string, options?: SecretDeliveryOptions) => Promise<unknown>;
	/** Remove a secret by key. Omit to hide the delete affordance. */
	onDelete?: (key: string) => Promise<unknown>;
	/** Extra per-secret content for the edit dialog (e.g. a live grants editor). */
	renderEditExtras?: (name: string) => ReactNode;
	/** A docs link rendered at the START of the toolbar (before Refresh/Add), matching the sshKeys/certificates config pages. */
	docsLink?: ReactNode;
	/** Extra toolbar actions, rendered after Refresh/Add. */
	children?: ReactNode;
	/** Enable the delivery-tier chooser (process.env vs scoped) + access examples in the dialogs. */
	delivery?: boolean;
	/** Tier pre-selected in the Add dialog (defaults to the safer scoped tier). */
	deliveryDefaultTier?: SecretTier;
	/** Component names the cluster reports, offered as suggestions in the Add dialog's grants picker. */
	grantableComponents?: string[];
}) {
	const columns = useMemo<Array<ColumnDef<SecretRow>>>(() => [
		{
			header: nameHeader,
			accessorKey: 'name',
			enableSorting: false,
		},
		{
			id: 'value',
			header: 'Value',
			enableSorting: false,
			cell: ({ row }) => <SecretValueCell value={row.original.value} warning={row.original.warning} />,
		},
	], [nameHeader]);

	const onRowClick = useCallback(
		(row?: Row<SecretRow>) => onSelectName(row?.original?.name),
		[onSelectName],
	);

	const [isAddModalOpen, setIsAddModalOpen] = useState(false);
	const existingKeys = useMemo(() => rows.map((row) => row.name), [rows]);
	const selectedRow = useMemo(() => rows.find((row) => row.name === selectedName), [rows, selectedName]);

	const onRefreshClick = useRefreshClick(onRefresh ?? (() => Promise.resolve()));

	return (
		<>
			<SimpleBrowseDataTable
				columns={columns}
				data={rows}
				isFetching={isFetching}
				onRowClick={canManage ? onRowClick : undefined}
			>
				{docsLink}
				{onRefresh && (
					<Button
						variant="defaultOutline"
						onClick={onRefreshClick}
						accessKey="r"
						disabled={isFetching}
					>
						<RefreshCwIcon />
						<span className="hidden lg:inline-block">
							<u>R</u>efresh
						</span>
					</Button>
				)}
				{canManage && (
					<Button
						variant="positiveOutline"
						onClick={() => setIsAddModalOpen(true)}
						accessKey="a"
						disabled={isAddModalOpen}
					>
						<PlusIcon />
						<span>
							<u>A</u>dd
						</span>
					</Button>
				)}
				{children}
			</SimpleBrowseDataTable>
			{isAddModalOpen && (
				<AddSecretModal
					isModalOpen={isAddModalOpen}
					setIsModalOpen={setIsAddModalOpen}
					description={addDescription}
					valueDescription={valueDescription}
					existingKeys={existingKeys}
					delivery={delivery}
					defaultTier={deliveryDefaultTier}
					grantableComponents={grantableComponents}
					onSubmit={({ key, value, ...options }) => onSet(key, value, options)}
				/>
			)}
			{selectedName && selectedRow && (
				<EditSecretModal
					key={selectedRow.name}
					name={selectedRow.name}
					description={editDescription}
					valueDescription={valueDescription}
					currentValue={selectedRow.value}
					delivery={delivery}
					currentTier={selectedRow.processEnv ? 'processEnv' : 'scoped'}
					onSave={(value, options) => onSet(selectedRow.name, value, options)}
					onDelete={onDelete && (() => onDelete(selectedRow.name))}
					closeModal={() => onSelectName(undefined)}
				>
					{renderEditExtras?.(selectedRow.name)}
				</EditSecretModal>
			)}
		</>
	);
}

/**
 * A masked secret value. When the plaintext is available, an eye toggle reveals it — a
 * deliberate action, so screens shared over a call don't flash secrets by accident.
 */
function SecretValueCell({ value, warning }: { value?: string; warning?: string }) {
	const [revealed, setRevealed] = useState(false);

	const warningIcon = warning && (
		<TriangleAlertIcon
			className="inline-block size-4 text-amber-500 shrink-0"
			aria-label={warning}
		>
			<title>{warning}</title>
		</TriangleAlertIcon>
	);

	if (value === undefined) {
		return (
			<span className="inline-flex items-center gap-1 max-w-full" title={warning}>
				{ENV_VALUE_MASK}
				{warningIcon}
			</span>
		);
	}

	// Row clicks open the edit dialog, so keep the toggle from bubbling into a selection.
	const onToggleClick = (event: MouseEvent) => {
		event.stopPropagation();
		setRevealed((current) => !current);
	};

	return (
		<span className="inline-flex items-center gap-1 max-w-full">
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="px-1"
				onClick={onToggleClick}
				title={revealed ? 'Hide value' : 'Reveal value'}
			>
				{revealed ? <EyeOffIcon /> : <EyeIcon />}
				<span className="sr-only">{revealed ? 'Hide value' : 'Reveal value'}</span>
			</Button>
			<span className={revealed ? 'font-mono' : undefined}>{revealed ? value : ENV_VALUE_MASK}</span>
			{warningIcon}
		</span>
	);
}
