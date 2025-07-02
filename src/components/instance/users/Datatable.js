import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardBody, Row, Col, Button } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';

import listUsers from '../../../functions/api/instance/listUsers';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import DataTable from '../../shared/DataTable';

const defaultTableState = {
	tableData: [],
	dataTableColumns: [],
	totalRecords: 0,
	filtered: [],
	sorted: [{ id: 'username', desc: false }],
	page: 0,
	loading: false,
	totalPages: 1,
	pageSize: 20,
	autoRefresh: false,
	showFilter: false,
	lastUpdate: false,
};

let controller;

function Datatable({ lastUpdate, setLastUpdate }) {
	const { customer_id } = useParams();
	const navigate = useNavigate();
	const compute_stack_id = useStoreState(instanceState, (s) => s.compute_stack_id);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [tableState, setTableState] = useState(defaultTableState);
	const [loading, setLoading] = useState(true);
	const sortParam = tableState.sorted[0]?.id;
	const sortDesc = tableState.sorted[0]?.desc;

	const rowClick = useCallback(
		(user_id) => {
			navigate(`/o/${customer_id}/i/${compute_stack_id}/users/${user_id}`);
		},
		// eslint-disable-next-line
		[compute_stack_id, customer_id]
	);

	useEffect(() => {
		let isMounted = true;

		const fetchData = async () => {
			setLoading(true);
			controller = new AbortController();
			const users = await listUsers({ auth, url, signal: controller.signal });
			if (isMounted) {
				setLoading(false);
				setTableState({
					...tableState,
					tableData: users,
					dataTableColumns: [
						{ Header: 'username', accessor: 'username' },
						{ Header: 'role', accessor: 'role' },
					],
					totalPages: Math.ceil((users.length || tableState.pageSize) / tableState.pageSize),
					loading: false,
				});
			}
		};

		if (auth) fetchData();

		return () => {
			isMounted = false;
			controller?.abort();
		};
		// eslint-disable-next-line
	}, [auth, lastUpdate, tableState.pageSize]);

	useEffect(() => {
		let isMounted = true;

		if (tableState.tableData.length && sortParam) {
			const userData = [...tableState.tableData];
			const sortedTableData = [...userData].sort((a, b) =>
				a[sortParam] > b[sortParam] && sortDesc ? 1 : a[sortParam] > b[sortParam] ? -1 : sortDesc ? -1 : 1
			);
			if (isMounted) setTableState({ ...tableState, tableData: sortedTableData });
		}
		return () => {
			isMounted = false;
			controller?.abort();
		};
		// eslint-disable-next-line
	}, [sortParam, sortDesc]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row className="floating-card-header">
				<Col>existing users</Col>
				<Col className="text-end">
					<Button color="link" onClick={() => setLastUpdate(Date.now())} className="me-2">
						<i title="Refresh Structure" className={`fa ${loading ? 'fa-spinner fa-spin' : 'fa-sync-alt'}`} />
					</Button>
					<span className="mx-3 text">|</span>
					<Button
						color="link"
						title="Filter Users"
						className="me-2"
						onClick={() =>
							setTableState({
								...tableState,
								filtered: tableState.showFilter ? [] : tableState.filtered,
								showFilter: !tableState.showFilter,
							})
						}
					>
						<i className="fa fa-search" />
					</Button>
				</Col>
			</Row>
			<Card className="mt-3">
				<CardBody className="react-table-holder">
					<DataTable
						columns={tableState.dataTableColumns}
						data={tableState.tableData}
						currentPage={tableState.page}
						pageSize={tableState.pageSize}
						totalPages={tableState.totalPages}
						showFilter={tableState.showFilter}
						sorted={tableState.sorted}
						loading={loading}
						onFilteredChange={(value) => setTableState({ ...tableState, filtered: value })}
						onSortedChange={(value) => setTableState({ ...tableState, sorted: value })}
						onPageChange={(value) => setTableState({ ...tableState, pageSize: value })}
						onPageSizeChange={(value) => setTableState({ ...tableState, page: 0, pageSize: value })}
						onRowClick={(rowData) => rowClick(rowData.username)}
					/>
				</CardBody>
			</Card>
		</ErrorBoundary>
	);
}

export default Datatable;
