import { RelationshipCell } from '@/features/instance/databases/components/RelationshipCell';
import { ExtraRecordAttribute } from '@/features/instance/databases/functions/extraRecordAttributes';
import { RelationshipAttributeInfo } from '@/features/instance/databases/functions/relationshipAttributes';
import { InstanceAttribute, InstanceTable } from '@/integrations/api/api.patch';
import { CellContext, ColumnDef } from '@/lib/table';
import { CellData, RowData, TableFeatures } from '@tanstack/react-table';
import { createElement } from 'react';

declare module '@tanstack/react-table' {
	// The type parameters (and their variance annotations) must match the library's own declaration
	// exactly, so they are repeated here even though only the added member matters.
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	interface ColumnMeta<
		in out TFeatures extends TableFeatures,
		in out TData extends RowData,
		TValue extends CellData = CellData,
	> {
		/** Set on relationship columns; drives the cell renderer and the sub-property filter UI. */
		relationshipInfo?: RelationshipAttributeInfo;
	}
}

export function formatBrowseDataTableHeader(
	instanceTable?: InstanceTable,
	relationshipInfoMap: Record<string, RelationshipAttributeInfo> = {},
	extraAttributes: readonly ExtraRecordAttribute[] = [],
): {
	dataTableColumns: Array<ColumnDef<Record<string, unknown>>>;
	primaryKey: string;
} {
	if (!instanceTable) {
		return {
			dataTableColumns: [],
			primaryKey: '',
		};
	}
	const primaryKey = browsePrimaryKey(instanceTable);
	const { attributes } = instanceTable;
	const primaryKeyColumns: ColumnDef<Record<string, unknown>>[] = [];
	const sortableColumns: ColumnDef<Record<string, unknown>>[] = [];
	const normalColumns: ColumnDef<Record<string, unknown>>[] = [];
	const extraColumns: ColumnDef<Record<string, unknown>>[] = [];
	const timeColumns: ColumnDef<Record<string, unknown>>[] = [];

	const relationshipCell =
		(info: RelationshipAttributeInfo) => (context: CellContext<Record<string, unknown>, unknown>) =>
			createElement(RelationshipCell, {
				value: context.getValue(),
				record: context.row.original,
				primaryKey,
				info,
			});

	for (let i = attributes.length - 1; i >= 0; i--) {
		const { attribute, type, is_primary_key, indexed } = attributes[i];
		const relationshipInfo = Object.hasOwn(relationshipInfoMap, attribute) ? relationshipInfoMap[attribute] : undefined;

		const dataTableColumn: ColumnDef<Record<string, unknown>> = {
			header: attribute,
			accessorKey: attribute,
			enableSorting: Boolean(is_primary_key || indexed),
			// Relationship columns are filterable via sub-properties (`.name value`), which the
			// server executes as a join against the related table.
			enableColumnFilter: Boolean(is_primary_key || indexed || relationshipInfo),
			size: sizeByAttributeType(type),
			cell: relationshipInfo ? relationshipCell(relationshipInfo) : renderPlainCell,
			meta: relationshipInfo ? { relationshipInfo } : undefined,
		};
		if (is_primary_key) {
			primaryKeyColumns.push(dataTableColumn);
		} else if (isTimeAttribute(attribute)) {
			timeColumns.push(dataTableColumn);
		} else if (dataTableColumn.enableSorting) {
			sortableColumns.push(dataTableColumn);
		} else {
			normalColumns.push(dataTableColumn);
		}
	}

	// Relationships known only from component schemas (Harper 5.1 omits relationship attributes
	// from describe) get a synthesized column: rows carry no value for them, so the cell renders
	// from the stored foreign key or the reverse-key link.
	const describedAttributes = new Set(attributes.map((attribute) => attribute.attribute));
	for (const [attribute, relationshipInfo] of Object.entries(relationshipInfoMap)) {
		if (describedAttributes.has(attribute)) {
			continue;
		}
		normalColumns.push({
			header: attribute,
			accessorKey: attribute,
			enableSorting: false,
			enableColumnFilter: true,
			size: sizeByAttributeType('String'),
			cell: relationshipCell(relationshipInfo),
			meta: { relationshipInfo },
		});
	}

	// Properties records carry beyond what describe declares. Harper refuses an undeclared attribute in
	// a condition or a sort ("unknown attribute"), so these columns only display.
	for (const { attribute, type } of extraAttributes) {
		if (describedAttributes.has(attribute) || Object.hasOwn(relationshipInfoMap, attribute)) {
			continue;
		}
		(isTimeAttribute(attribute) ? timeColumns : extraColumns).push({
			header: attribute,
			accessorKey: attribute,
			enableSorting: false,
			enableColumnFilter: false,
			size: sizeByAttributeType(type),
			cell: renderPlainCell,
		});
	}

	return {
		dataTableColumns: [...primaryKeyColumns, ...sortableColumns, ...normalColumns, ...extraColumns, ...timeColumns],
		primaryKey,
	};
}

export function browsePrimaryKey(instanceTable: InstanceTable | undefined): string {
	return instanceTable?.primary_key ?? instanceTable?.hash_attribute ?? '';
}

function isTimeAttribute(attribute: string) {
	return attribute === '__createdtime__' || attribute === '__updatedtime__';
}

/**
 * Default cell: objects and arrays render as JSON instead of the default renderer's
 * `[object Object]`/blank output, and booleans render as text (React renders `false` as nothing).
 */
function renderPlainCell(context: CellContext<Record<string, unknown>, unknown>) {
	const value = context.getValue();
	if (value == null) {
		return null;
	}
	if (typeof value === 'object') {
		return JSON.stringify(value);
	}
	return String(value);
}

// Default column widths (px). These are just starting points -- every column is resizable, and a
// user's adjustments are persisted per table, so these only need to be reasonable defaults.
function sizeByAttributeType(type: InstanceAttribute['type']) {
	switch (type) {
		case 'Id':
		case 'ID':
			return 220;
		case 'Boolean':
			return 90;
		case 'Int':
		case 'Long':
		case 'Float':
		case 'BigInt':
			return 120;
		case 'Date':
			return 190;
		case 'String':
		default:
			return 200;
	}
}
