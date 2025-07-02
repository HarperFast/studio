import React, { useEffect, useState } from 'react';
import { Row, Col, Input, Button, CardBody, Card } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import updatePassword from '../../../functions/api/lms/updatePassword';
import FormStatus from '../../shared/FormStatus';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import usePersistedUser from '../../../functions/state/persistedUser';

function Password() {
	const auth = useStoreState(appState, (s) => s.auth);
	const [persistedUser, setPersistedUser] = usePersistedUser({});
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const formStateHeight = '259px';

	const submit = async () => {
		setFormState({ submitted: true });
		const { oldpassword, newpassword, newpassword2 } = formData;
		if (oldpassword !== auth.pass) {
			setFormState({ error: 'old password is incorrect' });
			setFormData({});
		} else if (newpassword !== newpassword2) {
			setFormState({ error: 'new passwords do not match' });
			setFormData({});
		} else if (!oldpassword || !newpassword || !newpassword2) {
			setFormState({ error: 'all fields are required' });
			setFormData({});
		} else {
			setFormState({ processing: true });
			const newAuth = await updatePassword({ auth, user_id: auth.user_id, password: newpassword });

			if (!newAuth || newAuth.passwordError) {
				setFormState({ error: auth.message });
			} else {
				setPersistedUser({ ...persistedUser, pass: newpassword });
				setFormState({ success: auth.message });
				setFormData({});
			}
		}
	};

	useEffect(() => {
		let mounted = true;
		if (formState.error || formState.success) {
			setTimeout(() => {
				if (mounted) setFormState({});
			}, 2000);
		}
		return () => {
			mounted = false;
		};
	}, [formState.error, formState.success]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<div className="my-3">
				{formState.processing ? (
					<FormStatus
						height={formStateHeight}
						status="processing"
						header="Updating Password"
						subhead="The Security Shepherd is mad-hashing."
					/>
				) : formState.success ? (
					<FormStatus height={formStateHeight} status="success" header="Success!" subhead={formState.success} />
				) : formState.error ? (
					<FormStatus height={formStateHeight} status="error" header={formState.error} subhead="Please try again" />
				) : (
					<Card>
						<CardBody>
							<Row>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									current password
								</Col>
								<Col md="6" xs="12">
									<Input
										id="oldpassword"
										type="password"
										className="mb-0 text-center"
										name="current password"
										placeholder="current password"
										onChange={(e) => setFormData({ ...formData, oldpassword: e.target.value })}
										value={formData.oldpassword || ''}
										disabled={formState.submitted}
									/>
								</Col>
								<Col xs="12">
									<hr className="my-2" />
								</Col>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									new password
								</Col>
								<Col md="6" xs="12">
									<Input
										id="newpassword1"
										type="password"
										className="mb-0 text-center"
										name="new password"
										placeholder="new password"
										onChange={(e) => setFormData({ ...formData, newpassword: e.target.value })}
										value={formData.newpassword || ''}
										disabled={formState.submitted}
									/>
								</Col>
								<Col xs="12">
									<hr className="my-2" />
								</Col>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									verify password
								</Col>
								<Col md="6" xs="12">
									<Input
										id="newpassword2"
										type="password"
										className="mb-0 text-center"
										name="verify password"
										placeholder="verify password"
										onChange={(e) => setFormData({ ...formData, newpassword2: e.target.value })}
										value={formData.newpassword2 || ''}
										disabled={formState.submitted}
									/>
								</Col>
							</Row>
							<hr className="mt-2 mb-4" />
							<Button id="updatePassword" color="purple" block onClick={submit} disabled={formState.submitted}>
								Update Password
							</Button>
						</CardBody>
					</Card>
				)}
			</div>
		</ErrorBoundary>
	);
}

export default Password;
