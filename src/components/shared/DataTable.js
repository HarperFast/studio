import React, { useEffect, useState } from 'react';
import { useFilters, useTable, usePagination } from 'react-table';
import { Input } from 'reactstrap';
import { ErrorBoundary } from 'react-error-boundary';

import DataTableHeader from './DataTableHeader';
import DataTablePaginationManual from './DataTablePaginationManual';
import DataTablePaginationAuto from './DataTablePaginationAuto';
import DataTableRow from './DataTableRow';
import isImage from '../../functions/util/isImage';
import addError from '../../functions/api/lms/addError';
import ErrorFallback from './ErrorFallback';

function TextViewer({ value }) {
	return <div className="text-renderer">{value}</div>;
}

function ImageViewer({ src }) {
	const [previewOpen, setPreviewOpen] = useState(false);
	const [previewError, setPreviewError] = useState(false);

	return (
		<div
			className="image-renderer"
			onMouseEnter={() => setPreviewOpen(true)}
			onMouseLeave={() => setPreviewOpen(false)}
		>
			<i className="fa fa-image" />
			{previewOpen && previewError ? (
				<div className="preview-image no-image">
					<i className="fa fa-ban text-danger" />
					<div className="mt-2">image failed to load</div>
				</div>
			) : previewOpen ? (
				<img onError={setPreviewError} alt={src} src={src} className="preview-image" />
			) : null}
		</div>
	);
}

const handlCellValues = (value) => {
	const dataType = Object.prototype.toString.call(value);

	switch (dataType) {
		case '[object Array]':
		case '[object Object]':
			return <TextViewer value={JSON.stringify(value)} />;
		case '[object Boolean]':
			return <TextViewer value={value ? 'true' : 'false'} />;
		case '[object String]':
			return isImage(value) ? <ImageViewer src={value} /> : <TextViewer value={value} />;
		default:
			return <TextViewer value={value} />;
	}
};

const defaultColumn = {
	Filter: ({ column: { filterValue, setFilter } }) => (
		<Input type="text" value={filterValue || ''} onChange={(e) => setFilter(e.target.value || undefined)} />
	),
	Cell: ({ value }) => handlCellValues(value),
};

// Our table component
function DataTable({
	columns,
	data,
	error,
	currentPage,
	pageSize,
	totalPages,
	onFilteredChange,
	onSortedChange,
	onPageChange,
	onPageSizeChange,
	showFilter,
	onRowClick,
	sorted,
	loading,
	dynamicAttributesFromDataTable,
	tableDescriptionAttributes,
	manual = false,
}) {
	const {
		headerGroups,
		page,
		rows,
		prepareRow,
		state,
		setAllFilters,
		canPreviousPage,
		canNextPage,
		pageOptions,
		pageCount,
		gotoPage,
		nextPage,
		previousPage,
		setPageSize,
	} = useTable(
		{
			columns,
			data,
			defaultColumn,
			onFilteredChange,
			onSortedChange,
			onPageChange,
			onPageSizeChange,
			onRowClick,
			manualPagination: manual,
			manualFilters: manual,
			initialState: { pageIndex: currentPage, pageSize },
		},
		useFilters,
		usePagination
	);
	const [localLoading, setLocalLoading] = useState(true);

	const iterable = manual || !page.length ? rows : page;

	useEffect(() => {
		if (!showFilter && state.filters.length) {
			setAllFilters([]);
		} else {
			onFilteredChange(state.filters);
		}
		// eslint-disable-next-line
	}, [state.filters, showFilter]);

	useEffect(() => {
		setTimeout(() => setLocalLoading(false), 100);
	}, [iterable?.length]);

	return (
		<ErrorBoundary
			onError={(err, componentStack) => addError({ error: { message: err.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<div className="react-table-scroller">
				<DataTableHeader
					headerGroups={headerGroups}
					tableDescriptionAttributes={tableDescriptionAttributes}
					dynamicAttributesFromDataTable={dynamicAttributesFromDataTable}
					onSortedChange={onSortedChange}
					sorted={sorted}
					showFilter={showFilter}
				/>
				{loading || localLoading ? (
					<div className="centered text-center">
						<i className="fa fa-spinner fa-spin" />
					</div>
				) : iterable.length ? (
					iterable.map((row) => <DataTableRow key={row.id} row={row} prepareRow={prepareRow} onRowClick={onRowClick} />)
				) : (
					<div className="centered text-center">
						<i className="fa fa-exclamation-triangle text-danger" />
						<div className="mt-2 text-darkgrey">{error ? `Error loading data: ${error}` : 'no records'}</div>
					</div>
				)}
			</div>
			{manual ? (
				<DataTablePaginationManual
					page={currentPage}
					pageSize={pageSize}
					totalPages={totalPages}
					onPageChange={onPageChange}
					onPageSizeChange={onPageSizeChange}
					loading={loading}
				/>
			) : (
				<DataTablePaginationAuto
					previousPage={previousPage}
					pageSize={pageSize}
					canPreviousPage={canPreviousPage}
					pageIndex={state.pageIndex}
					pageOptions={pageOptions}
					gotoPage={gotoPage}
					setPageSize={setPageSize}
					pageCount={pageCount}
					nextPage={nextPage}
					canNextPage={canNextPage}
					loading={loading}
				/>
			)}
		</ErrorBoundary>
	);
}

export default DataTable;
