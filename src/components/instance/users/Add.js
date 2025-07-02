import React, { useEffect, useState } from 'react';
import { Input, Button, Card, CardBody } from 'reactstrap';
import SelectDropdown from 'react-select';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';

import addUser from '../../../functions/api/instance/addUser';
import FormStatus from '../../shared/FormStatus';
import isAlphaNumericUnderscoreHyphen from '../../../functions/util/isAlphaNumericUnderscoreHyphen';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import listRoles from '../../../functions/api/instance/listRoles';

function Add({ setLastUpdate }) {
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const users = useStoreState(instanceState, (s) => s.users);
	const roles = useStoreState(instanceState, (s) => s.roles);
	const useRoleId = useStoreState(instanceState, (s) => parseFloat(s.registration?.version) < 3);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const cardHeight = '224px';

	useAsyncEffect(async () => {
		const { submitted } = formState;
		if (submitted) {
			const { username, password, role } = formData;

			if (!username || !role || !password) {
				setFormState({ error: 'All fields must be filled out' });
			} else if (!isAlphaNumericUnderscoreHyphen(username)) {
				setFormState({ error: 'usernames must have only letters, numbers, hyphens, and underscores' });
				setTimeout(() => setFormState({}), 2000);
			} else if (users.find((u) => u.username.toLowerCase() === username.toLowerCase())) {
				setFormState({ error: 'User already exists' });
			} else {
				setFormState({ processing: true });
				const response = await addUser({ auth, role, username, password, url });

				if (response.message.indexOf('successfully') !== -1) {
					setLastUpdate(Date.now());
					setFormState({ success: response.message });
				} else {
					setFormState({ error: response.message });
				}
			}
			setTimeout(() => setFormData({}), 2000);
		}
	}, [formState]);

	useAsyncEffect(() => {
		setFormState({});
	}, [formData]);

	useAsyncEffect(() => roles && setFormData({ ...formData, role: false }), [roles]);

	useEffect(() => {
		listRoles({ auth, url });
	}, [auth, url]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<span className="floating-card-header">add user</span>
			{formState.processing ? (
				<FormStatus
					className="my-3"
					height={cardHeight}
					status="processing"
					header="Adding User"
					subhead="The Account Airedale Is A Good Boy"
				/>
			) : formState.success ? (
				<FormStatus
					className="my-3"
					height={cardHeight}
					status="success"
					header="Success!"
					subhead={formState.success}
				/>
			) : formState.error ? (
				<FormStatus
					className="my-3"
					height={cardHeight}
					status="error"
					header={formState.error}
					subhead="Please try again"
				/>
			) : (
				<Card className="my-3">
					<CardBody>
						<Input
							id="username"
							type="text"
							className="mb-2 text-center"
							name="username"
							placeholder="username"
							value={formData.username || ''}
							onChange={(e) => setFormData({ ...formData, username: e.target.value })}
						/>
						<Input
							id="password"
							type="text"
							className="mb-2 text-center"
							name="password"
							placeholder="password"
							value={formData.password || ''}
							onChange={(e) => setFormData({ ...formData, password: e.target.value })}
						/>
						<SelectDropdown
							className="react-select-container"
							classNamePrefix="react-select"
							onChange={({ value }) => setFormData({ ...formData, role: value })}
							options={roles && roles.map((r) => ({ label: r.role, value: useRoleId ? r.id : r.role }))}
							value={roles && formData.role && roles.find((r) => r.value === formData.role)}
							isSearchable={false}
							isClearable={false}
							isLoading={!roles}
							placeholder="select a role"
							styles={{
								placeholder: (styles) => ({ ...styles, textAlign: 'center', width: '100%', color: '#BCBCBC' }),
							}}
						/>
						<Button
							id="addInstanceUser"
							color="success"
							className="mt-3"
							block
							onClick={() => setFormState({ submitted: true })}
						>
							Add User
						</Button>
					</CardBody>
				</Card>
			)}
		</ErrorBoundary>
	);
}

export default Add;
