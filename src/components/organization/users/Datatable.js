import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardBody, Row, Col, Button } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useNavigate, useParams } from 'react-router-dom';
import { useAlert } from 'react-alert';

import appState from '../../../functions/state/appState';
import DataTable from '../../shared/DataTable';

const defaultTableState = {
	tableData: false,
	dataTableColumns: [],
	filtered: [],
	sorted: [{ id: 'email', desc: false }],
	page: 0,
	loading: false,
	totalPages: 1,
	pageSize: 20,
	autoRefresh: false,
	showFilter: false,
	lastUpdate: false,
};

function Datatable() {
	const { customer_id } = useParams();
	const alert = useAlert();
	const navigate = useNavigate();
	const [tableState, setTableState] = useState(defaultTableState);
	const sortParam = tableState.sorted[0]?.id;
	const sortDesc = tableState.sorted[0]?.desc;
	const auth = useStoreState(appState, (s) => s.auth);
	const users = useStoreState(appState, (s) => s.users);
	const tableColumns = [
		{ Header: 'email address', accessor: 'email' },
		{ Header: 'status', accessor: 'orgs[0].status' },
	];

	const rowClick = useCallback(
		(user_id) => {
			if (auth.user_id === user_id) {
				alert.error('Edit your own profile by clicking the user icon in the top nav');
			} else {
				navigate(`/o/${customer_id}/users/${user_id}`);
			}
		},
		// eslint-disable-next-line
		[auth.user_id, customer_id]
	);

	useEffect(() => {
		if (tableState.tableData.length && sortParam) {
			const userData = [...tableState.tableData];
			const sortedTableData = [...userData].sort((a, b) =>
				a[sortParam] > b[sortParam] && sortDesc ? -1 : a[sortParam] > b[sortParam] ? 1 : sortDesc ? 1 : -1
			);
			setTableState({ ...tableState, tableData: sortedTableData });
		}
		// eslint-disable-next-line
	}, [sortParam, sortDesc]);

	useEffect(() => {
		if (users && tableColumns) {
			setTableState({
				...tableState,
				tableData: users,
				dataTableColumns: tableColumns,
				totalPages: Math.ceil((users.length || tableState.pageSize) / tableState.pageSize),
			});
		}
		// eslint-disable-next-line
	}, [users, setTableState, tableState.pageSize]);

	return (
		<>
			<Row className="floating-card-header">
				<Col>existing org users</Col>
				<Col className="text-end">
					<Button
						color="link"
						tabIndex="0"
						title="Filter Users"
						className="me-3"
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
			<Card className="my-3">
				<CardBody className="react-table-holder">
					<DataTable
						columns={tableState.dataTableColumns}
						data={tableState.tableData}
						currentPage={tableState.page}
						pageSize={tableState.pageSize}
						totalPages={tableState.totalPages}
						showFilter={tableState.showFilter}
						sorted={tableState.sorted}
						loading={!users || (tableState.loading && !tableState.autoRefresh)}
						onFilteredChange={(value) => setTableState({ ...tableState, filtered: value })}
						onSortedChange={(value) => setTableState({ ...tableState, sorted: value })}
						onPageChange={(value) => setTableState({ ...tableState, pageSize: value })}
						onPageSizeChange={(value) => setTableState({ ...tableState, page: 0, pageSize: value })}
						onRowClick={(rowData) => rowClick(rowData.user_id)}
					/>
				</CardBody>
			</Card>
		</>
	);
}

export default Datatable;
