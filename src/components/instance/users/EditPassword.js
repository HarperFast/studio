import React, { useState } from 'react';
import { Button, Input, Col, Row } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useAlert } from 'react-alert';
import { useParams } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import alterUser from '../../../functions/api/instance/alterUser';
import instanceState from '../../../functions/state/instanceState';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import listUsers from '../../../functions/api/instance/listUsers';

function EditPassword() {
	const { username } = useParams();
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const alert = useAlert();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);

	const updatePassword = async () => {
		const { password } = formData;

		if (!password) {
			setFormState({ error: 'password is required' });
		} else {
			setFormState({ submitted: true });
			const response = await alterUser({ auth, url, username, password });
			setFormData({});
			if (response.message.indexOf('updated') !== -1) {
				alert.success('password updated');
				listUsers({ auth, url });
				setFormState({});
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
					Change user password
					<br />
					<span className="text-small">Modify user&apos;s access credentials</span>
				</Col>
				<Col xs="4">
					<Input
						id="password"
						type="text"
						className="text-center"
						name="password"
						placeholder="enter new password"
						value={formData.password || ''}
						onChange={(e) => setFormData({ ...formData, password: e.target.value })}
					/>
				</Col>
				<Col xs="4">
					<Button block color="success" onClick={updatePassword} disabled={formState.submitted || !formData.password}>
						Update Password
					</Button>
				</Col>
			</Row>
		</ErrorBoundary>
	);
}

export default EditPassword;
