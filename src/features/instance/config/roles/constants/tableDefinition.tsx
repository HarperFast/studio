import {
	expandEffectiveOperations,
	summarizeOperations,
} from '@/features/instance/config/roles/operations/operationsCatalog';
import { LocalRole } from '@/integrations/api/api.patch';
import {
	getOperationsAllowlist,
	hasMalformedOperations,
	rolePreventsOperationsAllowlist,
} from '@/integrations/api/localRolePermission';
import { ColumnDef, createColumnHelper } from '@/lib/table';
import { translateSecondsToAgo } from '@/lib/translateSecondsToAgo';

const columnHelper = createColumnHelper<LocalRole>();

export const dataTableColumns: Array<ColumnDef<LocalRole>> = [
	{
		header: 'Role',
		accessorKey: 'role',
		enableSorting: false,
	},
	columnHelper.display({
		header: 'ID',
		id: 'id',
		enableSorting: false,
		// Role names are not unique; surfacing the id makes roles that share a name distinguishable.
		cell: (props) => (
			<span className="font-mono text-xs text-muted-foreground" title={props.row.original.id}>
				{props.row.original.id}
			</span>
		),
	}),
	columnHelper.display({
		header: 'Created',
		enableSorting: false,
		id: '__createdtime__',
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__createdtime__) / 1000,
				props.row.original.__createdtime__,
			),
	}),
	columnHelper.display({
		header: 'Updated',
		id: '__updatedtime__',
		enableSorting: false,
		cell: (props) =>
			translateSecondsToAgo(
				(Date.now() - props.row.original.__updatedtime__) / 1000,
				props.row.original.__updatedtime__,
			),
	}),
	columnHelper.display({
		header: 'Super  User',
		id: 'super_user',
		enableSorting: false,
		cell: (props) => (props.row.original.permission.super_user ? 'Yes' : 'No'),
	}),
	columnHelper.display({
		header: 'Structure  User',
		id: 'structure_user',
		enableSorting: false,
		cell: (props) => (props.row.original.permission.structure_user ? 'Yes' : 'No'),
	}),
	columnHelper.display({
		header: 'Operations',
		id: 'operations',
		enableSorting: false,
		cell: (props) => {
			const permission = props.row.original.permission;
			if (permission.operations === undefined) {
				// The em dash alone reads as punctuation to a screen reader.
				return <span aria-label="No operation restriction">—</span>;
			}
			if (hasMalformedOperations(permission)) {
				return <span className="text-destructive" title="Not a list of operation names">invalid</span>;
			}
			if (rolePreventsOperationsAllowlist(permission)) {
				return (
					<span
						className="text-destructive"
						title="Harper rejects an allowlist on a super_user or cluster_user role"
					>
						conflicts with role
					</span>
				);
			}
			const effective = expandEffectiveOperations(getOperationsAllowlist(permission) ?? []);
			const summary = summarizeOperations(effective);
			return (
				<span title={summary}>
					{effective.length} allowed
					{/* title is hover-only, so the names need a path that reaches keyboard and screen readers. */}
					<span className="sr-only">: {summary}</span>
				</span>
			);
		},
	}),
];
