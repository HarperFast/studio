import React, { useState } from 'react';
import { Button, Col, Row } from 'reactstrap';
import SelectDropdown from 'react-select';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import alterUser from '../../../functions/api/instance/alterUser';
import instanceState from '../../../functions/state/instanceState';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import listUsers from '../../../functions/api/instance/listUsers';

function EditRole() {
	const { username } = useParams();
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const alert = useAlert();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const useRoleId = useStoreState(instanceState, (s) => parseFloat(s.registration?.version) < 3);
	const roles = useStoreState(instanceState, (s) =>
		s.roles.map((r) => ({ label: r.role, value: useRoleId ? r.id : r.role }))
	);
	const thisUser = useStoreState(instanceState, (s) => s.users && s.users.find((u) => u.username === username));

	const updateRole = async () => {
		const { newRole } = formData;

		if (!newRole) {
			setFormState({ error: 'role is required' });
		} else if (thisUser.role.id === newRole) {
			setFormState({ error: 'user already has this role' });
		} else {
			setFormState({ submitted: true });
			const response = await alterUser({ auth, url, username, role: newRole });

			if (response.message.indexOf('updated') !== -1) {
				alert.success('user role updated');
				listUsers({ auth, url });
				setFormState({});
			} else {
				alert.error(response.message);
				setFormState({});
			}
		}
	};

	useAsyncEffect(() => setFormData({ ...formData, newRole: thisUser?.role?.id }), []);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col xs="4" className="py-1">
					Change user role
					<br />
					<span className="text-small">Change what this user can do</span>
				</Col>
				<Col xs="4">
					<SelectDropdown
						className="react-select-container"
						classNamePrefix="react-select"
						onChange={({ value }) => setFormData({ ...formData, newRole: value })}
						options={roles.filter((r) => r.value !== thisUser.role.id)}
						value={roles.find((r) => r.value === formData.newRole)}
						isSearchable={false}
						isClearable={false}
						isLoading={!roles}
						placeholder="select a role"
						styles={{ placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }) }}
					/>
				</Col>
				<Col xs="4">
					<Button
						id="updateRole"
						block
						color="success"
						onClick={updateRole}
						disabled={formData.newRole === thisUser.role.id || formState === 'submitted'}
					>
						Update Role
					</Button>
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default EditRole;
