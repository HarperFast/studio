import React, { useState } from 'react';
import { Button, Input, Col, Row } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { useLocation, useParams, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';
import updateOrgUser from '../../../functions/api/lms/updateOrgUser';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';
import instanceState from '../../../functions/state/instanceState';

function EditDelete() {
	const { user_id, customer_id } = useParams();
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const alert = useAlert();
	const [formData, setFormData] = useState({});
	const [formState, setFormState] = useState({});
	const auth = useStoreState(appState, (s) => s.auth);

	const deleteUser = async () => {
		if (formData.delete_username !== 'DELETE') {
			alert.error('Please type DELETE to delete this user');
		} else {
			setFormState({ submitted: true });
			const response = await updateOrgUser({
				auth,
				user_id,
				user_id_owner: auth.user_id,
				customer_id,
				status: 'removed',
			});

			if (response.message.indexOf('successfully') !== -1) {
				alert.success(response.message);
				instanceState.update((s) => {
					s.lastUpdate = Date.now();
				});
				setFormState({});
				setTimeout(() => navigate(pathname.replace(`/${user_id}`, '')), 100);
			} else {
				alert.error(response.message);
				setFormState({});
			}
		}
	};

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col xs="4" className="py-1">
					Delete Org User
					<br />
					<span className="text-small">user will be removed from this organization</span>
				</Col>
				<Col xs="4">
					<Input
						id="delete_username"
						onChange={(e) => setFormData({ delete_username: e.target.value })}
						type="text"
						className="text-center"
						title="confirm username to delete"
						placeholder={`Enter "DELETE" here to enable deletion.`}
						value={formData.delete_username || ''}
					/>
				</Col>
				<Col xs="4">
					<Button
						id="deleteUser"
						block
						color="danger"
						onClick={deleteUser}
						disabled={formData.delete_username !== 'DELETE' || formState.submitted}
					>
						{formState.submitted ? <i className="fa fa-spinner fa-spin text-white" /> : <span>Delete User</span>}
					</Button>
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default EditDelete;
