import React, { useState } from 'react';
import { Button, Input, Col, Row } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';
import dropUser from '../../../functions/api/instance/dropUser';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import listUsers from '../../../functions/api/instance/listUsers';

function EditDelete() {
	const { username } = useParams();
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [formData, setFormData] = useState({});
	const [formState, setFormState] = useState({});
	const alert = useAlert();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);

	const deleteUser = async () => {
		if (formData.delete_username !== username) {
			alert.error('Please type the username to delete this user');
		} else {
			setFormState({ submitted: true });
			const response = await dropUser({ auth, username, url });

			if (response.message.indexOf('successfully') !== -1) {
				alert.success(response.message);
				listUsers({ auth, url });
				setFormState({});
				setTimeout(() => navigate(pathname.replace(`/users/${username}`, '/users')), 0);
			} else {
				alert.error(response.message);
				setFormState({});
			}
		}
	};

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col xs="4" className="py-1">
					Delete User
					<br />
					<span className="text-small">user will be removed from this instance</span>
				</Col>
				<Col xs="4">
					<Input
						id="delete_username"
						onChange={(e) => setFormData({ delete_username: e.target.value })}
						type="text"
						className="text-center"
						title="confirm username to delete"
						placeholder={`Enter "${username}" here to enable deletion.`}
						value={formData.delete_username || ''}
					/>
				</Col>
				<Col xs="4">
					<Button
						id="deleteUser"
						block
						color="success"
						onClick={deleteUser}
						disabled={username !== formData.delete_username || formState.submitted}
					>
						{formState.submitted ? <i className="fa fa-spinner fa-spin text-white" /> : <span>Delete User</span>}
					</Button>
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default EditDelete;
