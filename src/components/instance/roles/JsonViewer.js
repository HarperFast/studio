import React, { useState } from 'react';
import JSONInput from 'react-json-editor-ajrm';
import ToggleButton from 'react-toggle';
import locale from 'react-json-editor-ajrm/locale/en';
import { Button, Row, Col, Input } from 'reactstrap';
import { useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';
import instanceState from '../../../functions/state/instanceState';

import alterRole from '../../../functions/api/instance/alterRole';
import buildPermissionStructure from '../../../functions/instance/buildPermissionStructure';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';

function JsonViewer({ showAttributes, fetchRoles }) {
	const alert = useAlert();
	const { role_id } = useParams();
	const roles = useStoreState(instanceState, (s) => s.roles);
	const version = useStoreState(instanceState, (s) => s.registration?.version);
	const [major, minor] = version?.split('.') || [];
	const versionAsFloat = parseFloat(`${major}.${minor}`);
	const lastUpdate = useStoreState(instanceState, (s) => s.lastUpdate);
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const theme = useStoreState(appState, (s) => s.theme);
	const [newPermissions, setNewPermissions] = useState({});
	const [activePermissions, setActivePermissions] = useState({});
	const [newStructureUser, setNewStructureUser] = useState({});
	const [activeStructureUser, setActiveStructureUser] = useState({});
	const [loading, setLoading] = useState(false);
	const [changed, setChanged] = useState(false);
	const [validJSON, setValidJSON] = useState(true);
	const hasStructureUser = major >= 3 && (major > 3 || minor >= 3);
	const jsonHeight = hasStructureUser ? 'calc(100vh - 440px)' : 'calc(100vh - 340px)';

	const icons = {
		checked: (
			<div style={{ width: '100%', textAlign: 'center' }}>
				manage {versionAsFloat >= 4.2 ? 'databases' : 'schemas'}/tables
			</div>
		),
		unchecked: (
			<div style={{ width: '100%', textAlign: 'center' }}>
				manage {versionAsFloat >= 4.2 ? 'databases' : 'schemas'}/tables
			</div>
		),
	};

	useAsyncEffect(async () => {
		if (role_id && roles && roles.find((r) => r.id === role_id)?.permission) {
			const currentRolePermissions = roles.find((r) => r.id === role_id)?.permission;
			const defaultStructurePermissions = Array.isArray(currentRolePermissions.structure_user)
				? currentRolePermissions.structure_user.join(', ')
				: currentRolePermissions.structure_user || false;
			const defaultActivePermissions = await buildPermissionStructure({
				auth,
				url,
				version,
				currentRolePermissions,
				showAttributes,
			});
			setActivePermissions(defaultActivePermissions);
			setNewPermissions(defaultActivePermissions);
			setActiveStructureUser(defaultStructurePermissions);
			setNewStructureUser(defaultStructurePermissions);
		}
	}, [role_id, roles, lastUpdate, showAttributes]);

	const submitRecord = async (e) => {
		e.preventDefault();

		if (!newPermissions) {
			alert.error('Please insert valid JSON to proceed');
			return false;
		}

		setLoading(true);
		setChanged(false);

		const permission = { super_user: false, ...newPermissions };

		if (hasStructureUser) {
			permission.structure_user =
				newStructureUser === true
					? true
					: newStructureUser
						? newStructureUser.split(/[ ,]+/).filter((v) => v !== '')
						: false;
		}

		const response = await alterRole({ permission, id: role_id, auth, url });
		setLoading(false);

		if (response.error) {
			let message = response.role_errors || response.message;
			message += '. Permissions reset.';
			alert.error(message);
			setNewStructureUser(activeStructureUser);
			return setNewPermissions(activePermissions);
		}
		alert.success('Permissions updated successfully');
		fetchRoles();
		return instanceState.update((s) => {
			s.lastUpdate = Date.now();
		});
	};

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			{hasStructureUser && (
				<>
					<Row>
						<Col xs="12" sm="6" md="12" lg="5" xl="4" className="pt-2 pb-2">
							<ToggleButton
								width="100%"
								checked={!!newStructureUser}
								onChange={() => {
									setNewStructureUser(
										newStructureUser
											? false
											: newStructureUser === false && activeStructureUser
												? activeStructureUser
												: true
									);
									setChanged(true);
								}}
								icons={icons}
							/>
						</Col>
						{newStructureUser && (
							<Col xs="12" sm="6" md="12" lg="7" xl="8">
								<Input
									onChange={(e) => {
										setNewStructureUser(e.target.value ? e.target.value : true);
										setChanged(true);
									}}
									type="text"
									id="permitted_schemas"
									title={`permitted ${versionAsFloat >= 4.2 ? 'databases' : 'schemas'}`}
									placeholder={`comma-separated ${versionAsFloat >= 4.2 ? 'databases' : 'schemas'}, or blank for all`}
									value={newStructureUser === true ? '' : newStructureUser}
									disabled={loading}
								/>
							</Col>
						)}
					</Row>
					<hr />
				</>
			)}

			<JSONInput
				placeholder={activePermissions}
				height={jsonHeight}
				theme="light_mitsuketa_tribute"
				colors={{
					background: 'transparent',
					default: theme === 'dark' ? '#aaa' : '#000',
					colon: theme === 'dark' ? '#aaa' : '#000',
					keys: theme === 'dark' ? '#aaa' : '#000',
					string: '#13c664',
					number: '#ea4c89',
					primitive: '#ffa500',
				}}
				style={{
					warningBox: { display: 'none' },
				}}
				locale={locale}
				width="100%"
				waitAfterKeyPress={1000}
				confirmGood={false}
				onChange={(value) => {
					setValidJSON(!value.error);
					setChanged(JSON.stringify(value.jsObject) !== JSON.stringify(activePermissions));
					setNewPermissions(value.jsObject);
				}}
			/>
			<hr />
			<Button
				id="updateRolePermissions"
				block
				color="success"
				disabled={loading || !changed || !validJSON}
				onClick={submitRecord}
			>
				{loading ? <i className="fa fa-spinner fa-spin text-white" /> : <span>Update Role Permissions</span>}
			</Button>
		</ErrorBoundary>
	);
}

export default JsonViewer;
