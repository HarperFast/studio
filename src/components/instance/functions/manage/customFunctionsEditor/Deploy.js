import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { Button, Card, CardBody, Col, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import useAsyncEffect from 'use-async-effect';

import appState from '../../../../../functions/state/appState';
import instanceState from '../../../../../functions/state/instanceState';

import DataTable from '../../../../shared/DataTable';
import buildCustomFunctionDeployColumns from '../../../../../functions/instance/clustering/deployRows';
import useInstanceAuth from '../../../../../functions/state/instanceAuths';
import packageCustomFunctionProject from '../../../../../functions/api/instance/packageCustomFunctionProject';
import customFunctionsStatus from '../../../../../functions/api/instance/customFunctionsStatus';
import getCustomFunctions from '../../../../../functions/api/instance/getCustomFunctions';
import deployCustomFunctionProject from '../../../../../functions/api/instance/deployCustomFunctionProject';
import dropCustomFunctionProject from '../../../../../functions/api/instance/dropCustomFunctionProject';
import installNodeModules from '../../../../../functions/api/instance/installNodeModules';
import restartService from '../../../../../functions/api/instance/restartService';

const defaultTableState = {
	filtered: [],
	sorted: [],
	page: 0,
	totalPages: 1,
	pageSize: 20,
	autoRefresh: false,
	showFilter: false,
	lastUpdate: false,
};

function Deploy() {
	const { customer_id, compute_stack_id, project } = useParams();
	const navigate = useNavigate();
	const [instanceAuths] = useInstanceAuth({});
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const version = useStoreState(instanceState, (s) => s.registration?.version);
	const [{ payload, file }, setPayloadAndFile] = useState([]);
	const returnUrl = `/o/${customer_id}/i/${compute_stack_id}/functions/edit/${project}`;
	const instances = useStoreState(appState, (s) => s.instances.filter((i) => i.compute_stack_id !== compute_stack_id));
	const [major, minor] = version.split('.');
	const canSkipNodeModules = major >= 3 && (major > 3 || minor >= 3);
	const [tableData, setTableData] = useState([]);
	const [skipNodeModules, setSkipNodeModules] = useState(canSkipNodeModules);
	const [loading, setLoading] = useReducer((state, newState) => ({ ...state, ...newState }), {});
	const [tableState, setTableState] = useState(defaultTableState);

	// NOTE: not sure about 'navigate' dep. this was adapted from migration from history to navigate.
	const handleReturn = useCallback(() => navigate(returnUrl), [navigate, returnUrl]);

	const updateInstanceCFStatus = useCallback(
		async (destination_compute_stack_id, action) => {
			const thisInstance = tableData.find((i) => i.compute_stack_id === destination_compute_stack_id);
			const instanceAuth = instanceAuths[destination_compute_stack_id];

			if (thisInstance && instanceAuth) {
				setLoading({ [destination_compute_stack_id]: action });
				let now_has_current_project = false;
				const custom_functions_status = await customFunctionsStatus({ auth: instanceAuth, url: thisInstance.url });
				if (!custom_functions_status.error) {
					const instance_custom_functions = await getCustomFunctions({ auth: instanceAuth, url: thisInstance.url });
					now_has_current_project = Object.keys(instance_custom_functions).includes(project);
				}

				const newTableData = tableData.map((instance) => {
					if (instance.compute_stack_id === destination_compute_stack_id) {
						instance.custom_functions_status = custom_functions_status;
						instance.has_current_project = now_has_current_project;
					}
					return instance;
				});

				setTableData(newTableData);
				setLoading({ [destination_compute_stack_id]: null });
			}
		},
		[instanceAuths, project, tableData]
	);

	const handleClick = useCallback(
		async (destination_compute_stack_id, action) => {
			const thisInstance = tableData.find((i) => i.compute_stack_id === destination_compute_stack_id);
			const instanceAuth = instanceAuths[destination_compute_stack_id];

			if (thisInstance && instanceAuth) {
				setLoading({ [destination_compute_stack_id]: action });

				if (action === 'deploy') {
					await deployCustomFunctionProject({
						auth: instanceAuth,
						url: thisInstance.url,
						payload,
						project,
						file,
					});
					if (skipNodeModules) {
						await installNodeModules({
							auth: instanceAuth,
							url: thisInstance.url,
							projects: [project],
						});
					}
					await restartService({
						auth: instanceAuth,
						url: thisInstance.url,
						service: 'custom_functions',
					});
				} else {
					await dropCustomFunctionProject({
						auth: instanceAuth,
						url: thisInstance.url,
						project,
					});
				}
				setTimeout(() => {
					setLoading({ [destination_compute_stack_id]: false });
					updateInstanceCFStatus(destination_compute_stack_id, action);
				}, 1000);
			}
		},
		[file, instanceAuths, payload, project, tableData, updateInstanceCFStatus, skipNodeModules]
	);

	useAsyncEffect(async () => {
		if (auth && url && project) {
			setPayloadAndFile(false);
			const payloadAndFile = await packageCustomFunctionProject({
				auth,
				url,
				project,
				skip_node_modules: skipNodeModules,
			});
			setPayloadAndFile(payloadAndFile);
		}
	}, [auth, url, project, skipNodeModules]);

	useAsyncEffect(async () => {
		if (instances) {
			const loadedInstances = await Promise.all(
				instances.map(async (instance) => {
					const instanceAuth = instanceAuths[instance.compute_stack_id];
					let instance_custom_functions = {};
					if (instanceAuth) {
						const custom_functions_status = await customFunctionsStatus({ auth: instanceAuth, url: instance.url });
						if (!custom_functions_status.error) {
							instance_custom_functions = await getCustomFunctions({ auth: instanceAuth, url: instance.url });
						}
						return {
							...instance,
							custom_functions_status,
							has_auth: true,
							has_current_project: Object.keys(instance_custom_functions).includes(project),
						};
					}
					return { ...instance, custom_functions_status: false };
				})
			);
			setTableData(loadedInstances);
		}
	}, [instances, project]);

	useEffect(() => {
		setTableState({
			...tableState,
			totalPages: Math.ceil((tableData.length || tableState.pageSize) / tableState.pageSize),
		});
		// eslint-disable-next-line
	}, [setTableState, tableState.pageSize]);

	return (
		<>
			<Row className="floating-card-header">
				<Col>deploy {project && `> ${project}`}</Col>
				<Col className="text-end">
					{canSkipNodeModules && (
						<>
							<Button color="link" title="Turn on autofresh" onClick={() => setSkipNodeModules(!skipNodeModules)}>
								<span className="me-2">install dependencies at destination</span>
								<i className={`fa fa-lg fa-toggle-${skipNodeModules ? 'on' : 'off'}`} />
							</Button>
							<span className="mx-3 text">|</span>
						</>
					)}
					<Button onClick={handleReturn} color="link" className="me-2">
						<span className="me-2">back to edit</span>
						<i title="Edit Project" className="fa fa-edit" />
					</Button>
				</Col>
			</Row>
			<Card className="my-3">
				<CardBody className="react-table-holder">
					{tableData.length ? (
						<DataTable
							columns={buildCustomFunctionDeployColumns({ initializing: !payload, loading, handleClick })}
							data={tableData}
							page={tableState.page}
							pageSize={tableState.pageSize}
							totalPages={tableState.totalPages}
							showFilter={tableState.showFilter}
							sorted={tableState.sorted}
							onFilteredChange={(value) => setTableState({ ...tableState, filtered: value })}
							onSortedChange={(value) => setTableState({ ...tableState, sorted: value })}
							onPageChange={(value) => setTableState({ ...tableState, pageSize: value })}
							onPageSizeChange={(value) => setTableState({ ...tableState, page: 0, pageSize: value })}
						/>
					) : (
						<div className="empty-prompt">
							Please register at least one Custom Function-enabled instance to deploy to
						</div>
					)}
				</CardBody>
			</Card>
		</>
	);
}

export default Deploy;
