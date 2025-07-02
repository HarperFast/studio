import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useInterval from 'use-interval';
import { Card, CardBody } from 'reactstrap';
import { useStoreState } from 'pullstate';

import instanceState from '../../../functions/state/instanceState';

import config from '../../../config';
import DataTableHeader from './BrowseDatatableHeader';
import DataTable from '../../shared/DataTable';
import getTableData from '../../../functions/instance/getTableData';
import getTablePagination from '../../../functions/instance/getTablePagination';
import usePersistedUser from '../../../functions/state/persistedUser';
import { clearTableDescriptionCache } from '../../../functions/instance/state/describeTableCache';

let controller;
let controller2;
let controller3;

function BrowseDatatable({ tableState, setTableState, activeTable }) {
	const navigate = useNavigate();
	const { compute_stack_id, schema, table, customer_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [totalPages, setTotalPages] = useState(false);
	const [totalRecords, setTotalRecords] = useState(false);
	const [loading, setLoading] = useState(false);
	const [loadingFilter, setLoadingFilter] = useState(false);
	const [lastUpdate, setLastUpdate] = useState(true);
	const [persistedUser, setPersistedUser] = usePersistedUser({});

	useEffect(() => {
		controller?.abort();
		controller2?.abort();
		controller3?.abort();
		setLoadingFilter(false);
		setLoading(false);

		let isMounted = true;

		const fetchPagination = async () => {
			setLoadingFilter(true);
			setTotalPages(false);
			controller3 = new AbortController();

			const { newTotalRecords, newTotalPages } = await getTablePagination({
				schema,
				table,
				filtered: tableState.filtered,
				pageSize: parseInt(tableState.pageSize, 10),
				auth,
				url,
				signal: controller3.signal,
			});
			if (isMounted) {
				setLoadingFilter(false);
				setTotalPages(newTotalPages);
				setTotalRecords(newTotalRecords);
			}
		};

		const fetchData = async () => {
			if (!tableState.filtered.length) {
				setLoading(true);
			}
			controller = new AbortController();
			controller2 = new AbortController();
			const {
				newData,
				newTotalRecords,
				newTotalPages,
				newEntityAttributes,
				hashAttribute,
				dynamicAttributesFromDataTable,
				dataTableColumns,
				schemaAttributes,
				error,
			} = await getTableData({
				schema,
				table,
				filtered: tableState.filtered,
				pageSize: parseInt(tableState.pageSize, 10),
				sorted: tableState.sorted,
				onlyCached: tableState.onlyCached,
				page: tableState.page,
				auth,
				url,
				signal: controller.signal,
				signal2: controller2.signal,
			});

			if (isMounted) {
				setLoading(false);
				if (newData.error) {
					setTableState({
						...tableState,
						tableData: [],
						error,
					});
				} else {
					if (!tableState.filtered.length) {
						setTotalPages(newTotalPages);
						setTotalRecords(newTotalRecords);
					} else if (newData.length < tableState.pageSize) {
						setTotalPages(1);
						setTotalRecords(newData.length);
					} else {
						fetchPagination();
					}
					setTableState({
						...tableState,
						tableData: newData,
						newEntityAttributes,
						hashAttribute,
						dataTableColumns,
						dynamicAttributesFromDataTable,
						schemaAttributes,
						error,
					});
				}
			}
		};

		fetchData();

		return () => {
			controller?.abort();
			controller2?.abort();
			controller3?.abort();
			isMounted = false;
		};
		// eslint-disable-next-line
	}, [
		tableState.sorted,
		tableState.page,
		tableState.filtered,
		tableState.pageSize,
		tableState.onlyCached,
		lastUpdate,
		activeTable,
	]);

	const toggleOnlyCached = () => {
		setTableState({ ...tableState, onlyCached: !tableState.onlyCached });
	};

	useInterval(() => tableState.autoRefresh && setLastUpdate(Date.now()), config.refresh_content_interval);

	return (
		<>
			<DataTableHeader
				totalRecords={totalRecords}
				loading={loading}
				loadingFilter={loadingFilter}
				autoRefresh={tableState.autoRefresh}
				onlyCached={tableState.onlyCached}
				refresh={() => {
					clearTableDescriptionCache();
					setLastUpdate(Date.now());
				}}
				toggleAutoRefresh={() => {
					setTableState({ ...tableState, autoRefresh: !tableState.autoRefresh });
					clearTableDescriptionCache();
				}}
				toggleOnlyCached={toggleOnlyCached}
				toggleFilter={() => {
					setTableState({ ...tableState, showFilter: !tableState.showFilter });
				}}
			/>
			<Card className="my-3">
				<CardBody className="react-table-holder">
					<DataTable
						manual
						columns={tableState.dataTableColumns || []}
						data={tableState.tableData || []}
						error={tableState.error}
						tableDescriptionAttributes={tableState.schemaAttributes}
						dynamicAttributesFromDataTable={tableState.dynamicAttributesFromDataTable}
						currentPage={tableState.page}
						pageSize={tableState.pageSize}
						totalPages={totalPages || 0}
						showFilter={tableState.showFilter}
						sorted={tableState.sorted.length ? tableState.sorted : [{ id: tableState.hashAttribute, desc: false }]}
						loading={loading && !tableState.autoRefresh}
						onFilteredChange={(value) => {
							setTableState({ ...tableState, page: 0, filtered: value });
						}}
						onSortedChange={(value) => {
							setTableState({ ...tableState, page: 0, sorted: value });
						}}
						onPageChange={(value) => {
							setTableState({ ...tableState, page: value });
						}}
						onPageSizeChange={(value) => {
							setTableState({ ...tableState, page: 0, pageSize: value });
						}}
						onRowClick={(rowData) => {
							// encode schema, table and hashValue because they can contain uri components
							const hashValue = rowData[tableState.hashAttribute];
							const encodedSchema = encodeURIComponent(schema);
							const encodedTable = encodeURIComponent(table);
							const encodedHash = encodeURIComponent(hashValue);

							const recordViewUrl = `/o/${customer_id}/i/${compute_stack_id}/browse/${encodedSchema}/${encodedTable}/edit/${encodedHash}`;
							const navigateOptions = { state: { hashValue } };

							navigate(recordViewUrl, navigateOptions);
						}}
					/>
				</CardBody>
			</Card>
		</>
	);
}

export default BrowseDatatable;
