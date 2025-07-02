import React, { useEffect, useState } from 'react';
import { Row, Col, Input, Button, CardBody, Card } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { ErrorBoundary } from 'react-error-boundary';

import appState from '../../../functions/state/appState';

import updateUser from '../../../functions/api/lms/updateUser';
import FormStatus from '../../shared/FormStatus';
import ErrorFallback from '../../shared/ErrorFallback';
import addError from '../../../functions/api/lms/addError';
import isURL from '../../../functions/util/isURL';

function Profile() {
	const auth = useStoreState(appState, (s) => s.auth);
	const [formState, setFormState] = useState({});
	const [formData, setFormData] = useState(auth);
	const formStateHeight = '314px';

	const submit = () => {
		setFormState({ submitted: true });
		const { firstname, lastname, github_repo, email } = formData;
		if (!firstname || !lastname || !email) {
			setFormState({ error: 'All fields are required' });
		} else if (github_repo && !isURL(github_repo)) {
			setFormState({ error: 'github repo must be a valid URL' });
		} else if (
			auth.firstname === firstname &&
			auth.lastname === lastname &&
			auth.github_repo === github_repo &&
			auth.email === email
		) {
			setFormState({ error: 'Nothing seems to have changed' });
		} else {
			setFormState({ processing: true });
			updateUser({ auth, firstname, lastname, user_id: auth.user_id, github_repo, email });
		}
	};

	useEffect(() => {
		let mounted = true;
		if (mounted && auth?.profileError) {
			setFormState({ error: auth.message });
		} else if (mounted && auth?.profileSuccess) {
			setFormState({ success: auth.message });
		}
		return () => {
			mounted = false;
		};
		// eslint-disable-next-line
	}, [auth.profileError, auth.profileSuccess]);

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
						header="Updating Profile"
						subhead="The Profile Poodle is doing his thing."
					/>
				) : formState.success ? (
					<FormStatus height={formStateHeight} status="success" header="Success!" subhead={formState.success} />
				) : formState.error ? (
					<FormStatus height={formStateHeight} status="error" header={formState.error} subhead="Please try again" />
				) : (
					<Card className="mb-3">
						<CardBody>
							<Row>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									{auth?.email_bounced && !auth?.profileSuccess ? (
										<span className="text-danger">please provide a valid email address</span>
									) : (
										<span>{auth.email}</span>
									)}
								</Col>
								<Col md="6" xs="12">
									<Input
										id="email"
										type="text"
										className={`mb-0 text-center ${auth?.email_bounced && !auth?.profileSuccess ? 'error' : ''}`}
										name="email"
										placeholder="email address"
										onChange={(e) => setFormData({ ...formData, email: e.target.value })}
										value={formData.email || ''}
										disabled={formState.submitted}
									/>
								</Col>
								<Col xs="12">
									<hr className="my-2" />
								</Col>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									first name
								</Col>
								<Col md="6" xs="12">
									<Input
										id="firstname"
										type="text"
										className="mb-0 text-center"
										name="fname"
										placeholder="first name"
										onChange={(e) => setFormData({ ...formData, firstname: e.target.value })}
										value={formData.firstname || ''}
										disabled={formState.submitted}
									/>
								</Col>
								<Col xs="12">
									<hr className="my-2" />
								</Col>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									last name
								</Col>
								<Col md="6" xs="12">
									<Input
										id="lastname"
										type="text"
										className="mb-0 text-center"
										name="lname"
										placeholder="last name"
										onChange={(e) => setFormData({ ...formData, lastname: e.target.value })}
										value={formData.lastname || ''}
										disabled={formState.submitted}
									/>
								</Col>
								<Col xs="12">
									<hr className="my-2" />
								</Col>
								<Col xs="6" className="text text-nowrap d-none d-md-block pt-2">
									github repo
								</Col>
								<Col md="6" xs="12">
									<Input
										id="github_repo"
										type="text"
										className="mb-0 text-center"
										name="github_repo"
										placeholder="github repo"
										onChange={(e) => setFormData({ ...formData, github_repo: e.target.value })}
										value={formData.github_repo || ''}
										disabled={formState.submitted}
									/>
								</Col>
							</Row>
							<hr className="mt-2 mb-4" />
							<Button id="saveProfile" color="purple" block onClick={submit} disabled={formState.submitted}>
								Save Profile
							</Button>
						</CardBody>
					</Card>
				)}
			</div>
		</ErrorBoundary>
	);
}

export default Profile;
