import React, { useState } from 'react';
import { Input, Button, CardBody, Card } from 'reactstrap';
import useAsyncEffect from 'use-async-effect';
import { useStoreState } from 'pullstate';
import { useParams, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import addUser from '../../../functions/api/lms/addUser';
import isEmail from '../../../functions/util/isEmail';
import FormStatus from '../../shared/FormStatus';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function Add({ refreshUsers, userEmails }) {
	const navigate = useNavigate();
	const { customer_id } = useParams();
	const auth = useStoreState(appState, (s) => s.auth);

	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState({});
	const formStateHeight = '132px';

	useAsyncEffect(async () => {
		const { email } = formData;
		const { submitted } = formState;
		if (submitted) {
			if (!isEmail(email)) {
				setFormState({ error: 'Please enter a valid email' });
			} else if (userEmails && userEmails.includes(email)) {
				setFormState({ error: 'This user has already been invited' });
			} else if (email === auth.email) {
				setFormState({ error: 'You cannot invite yourself' });
			} else {
				setFormState({ processing: true });

				const response = await addUser({ auth, email, customer_id });
				if (response.error) {
					setFormState({ error: response.message });
				} else {
					if (window._kmq) window._kmq.push(['record', 'added org user']);
					refreshUsers();
					setFormState({ success: response.message });
				}
			}
			setTimeout(() => setFormData({}), 2000);
		}
	}, [formState]);

	useAsyncEffect(() => setFormState({}), [formData]);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack }, customer_id })}
			FallbackComponent={ErrorFallback}
		>
			<div className="mt-3 mb-4">
				{auth.email_bounced ? (
					<Card>
						<CardBody>
							<b>Unable to Add New Org User</b>
							<br />
							<br />
							Your email address seems to be unreachable. Please update it to ensure billing, upgrade, and other
							critical system announcements reach you.
							<br />
							<br />
							<Button
								id="updateEmail"
								onClick={() => navigate('/profile')}
								title="Update My Email"
								block
								className="mt-3"
								color="danger"
							>
								Update My Email
							</Button>
						</CardBody>
					</Card>
				) : formState.processing ? (
					<FormStatus
						height={formStateHeight}
						status="processing"
						header="Adding User"
						subhead="The Account Airedale Is A Good Boy"
					/>
				) : formState.success ? (
					<FormStatus height={formStateHeight} status="success" header="Success!" subhead={formState.success} />
				) : formState.error ? (
					<FormStatus height={formStateHeight} status="error" header={formState.error} subhead="Please try again" />
				) : (
					<Card>
						<CardBody>
							<Input
								id="email"
								type="text"
								className="mb-3 text-center"
								name="email"
								placeholder="email address"
								onChange={(e) => setFormData({ ...formData, email: e.target.value.toLowerCase() })}
								disabled={formState.submitted}
							/>

							<Button
								id="addOrganizationUser"
								color="success"
								block
								onClick={() => setFormState({ submitted: true })}
								disabled={formState.submitted}
							>
								Add Org User
							</Button>
						</CardBody>
					</Card>
				)}
			</div>
		</ErrorBoundary>
	);
}

export default Add;
