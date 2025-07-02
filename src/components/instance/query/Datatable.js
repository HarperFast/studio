import React, { useState, useEffect } from 'react';
import useInterval from 'use-interval';
import { Card, CardBody } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';

import config from '../../../config';
import instanceState from '../../../functions/state/instanceState';

import DatatableHeader from './DatatableHeader';
import ChartModal from './ChartModal';
import getQueryData from '../../../functions/instance/getQueryData';
import EmptyPrompt from './EmptyPrompt';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import DataTable from '../../shared/DataTable';

const defaultTableState = {
	tableData: false,
	totalRecords: 0,
	dataTableColumns: [],
	filtered: [],
	sorted: [],
	page: 0,
	totalPages: 1,
	pageSize: 20,
	autoRefresh: false,
	onlyCached: true,
	showFilter: false,
	lastUpdate: false,
};

let controller;

function Datatable({ query }) {
	const [lastUpdate, setLastUpdate] = useState();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [tableState, setTableState] = useState(defaultTableState);
	const [showChartModal, setShowChartModal] = useState(false);
	const [loading, setLoading] = useState(false);

	const cancel = () => {
		if (controller) controller.abort();
		setTableState(defaultTableState);
		setLoading(false);
	};

	useEffect(() => {
		let isMounted = true;

		const fetchData = async () => {
			if (query.query && query.lastUpdate) {
				if (controller) controller.abort();
				controller = new AbortController();
				setLoading(true);
				const response = await getQueryData({
					query: query.query.replace(/\n/g, ' ').trim(),
					auth,
					url,
					signal: controller.signal,
				});
				setLoading(false);

				if (response.error && response.message === 'Aborted') {
					setTableState({
						...tableState,
						message: 'query canceled, please execute a new query to proceed',
						error: false,
					});
				} else if (response.error) {
					setTableState({
						...tableState,
						message: `error fetching data: ${response.message}`,
						access_errors: response.access_errors,
						error: true,
					});
				} else if (response.message) {
					setTableState({ ...tableState, message: response.message, error: false });
				} else if (isMounted) {
					setTableState({
						...tableState,
						...response,
						totalPages: Math.ceil((response.tableData?.length || 20) / 20),
						error: false,
						message: response.totalRecords ? false : 'no records matched your query',
						sorted: [],
					});
				}
			}
		};

		fetchData();

		return () => {
			controller?.abort();
			isMounted = false;
		};
		// eslint-disable-next-line
	}, [query, lastUpdate]);

	useEffect(() => {
		setTableState(defaultTableState);
	}, [query.query]);

	useInterval(() => {
		if (tableState.autoRefresh && !loading) setLastUpdate(Date.now());
	}, config.refresh_content_interval);

	return loading || tableState.message || tableState.access_errors ? (
		<EmptyPrompt
			error={tableState.error}
			accessErrors={tableState.access_errors}
			loading={loading}
			message={loading ? false : tableState.message}
			cancel={cancel}
		/>
	) : tableState.tableData?.length ? (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<DatatableHeader
				totalRecords={tableState.totalRecords}
				loading={loading}
				showFilter={tableState.showFilter}
				filtered={tableState.filtered}
				toggleFilter={(newValues) => setTableState({ ...tableState, ...newValues })}
				autoRefresh={tableState.autoRefresh}
				onlyCached={tableState.onlyCached}
				setAutoRefresh={() => setTableState({ ...tableState, autoRefresh: !tableState.autoRefresh })}
				setOnlyCached={() => setTableState({ ...tableState, onlyCached: !tableState.onlyCached })}
				setLastUpdate={setLastUpdate}
				setShowChartModal={setShowChartModal}
			/>
			<Card className="my-3">
				<CardBody className="react-table-holder">
					<DataTable
						columns={tableState.dataTableColumns || []}
						data={tableState.tableData || []}
						currentPage={tableState.page}
						pageSize={tableState.pageSize}
						totalPages={tableState.totalPages}
						showFilter={tableState.showFilter}
						sorted={tableState.sorted}
						loading={loading && !tableState.autoRefresh}
						onFilteredChange={(value) => setTableState({ ...tableState, filtered: value })}
						onSortedChange={(value) => setTableState({ ...tableState, sorted: value })}
						onPageChange={(value) => setTableState({ ...tableState, pageSize: value })}
						onPageSizeChange={(value) => setTableState({ ...tableState, page: 0, pageSize: value })}
					/>
				</CardBody>
			</Card>
			{showChartModal && (
				<ChartModal
					setShowChartModal={setShowChartModal}
					tableData={tableState.tableData}
					query={query.query.replace(/\n/g, ' ').trim()}
				/>
			)}
		</ErrorBoundary>
	) : (
		<EmptyPrompt message="please execute a SQL query to proceed" />
	);
}

export default Datatable;
