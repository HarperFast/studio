import React, { useCallback, useState } from 'react';
import { Button, Col, Input, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';
import getJob from '../../../functions/api/instance/getJob';
import isURL from '../../../functions/util/isURL';
import csvURLLoad from '../../../functions/api/instance/csvURLLoad';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function CsvUploadURL() {
	const navigate = useNavigate();
	const { schema, table, customer_id, compute_stack_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth);
	const url = useStoreState(instanceState, (s) => s.url);
	const [formData, setFormData] = useState({});
	const [formState, setFormState] = useState({});
	const [mounted, setMounted] = useState(false);

	const validateData = useCallback(
		async (uploadJobId) => {
			try {
				const [{ status, message }] = await getJob({ auth, url, id: uploadJobId });
				if (status === 'ERROR') {
					if (
						['Error: CSV Load failed from URL', 'Error downloading CSV file'].some((i) => message.indexOf(i) !== -1)
					) {
						return setFormState({ error: 'The URL did not return a valid csv file' });
					}
					if (['unsupported content type'].some((i) => message.indexOf(i) !== -1)) {
						return setFormState({ error: `File error: ${message.split(',')[1]}` });
					}
					return setFormState({ error: message.split(':')[1] });
				}
				if (status !== 'COMPLETE' && mounted) {
					return setTimeout(() => validateData(uploadJobId), 2000);
				}
				instanceState.update((s) => {
					s.lastUpdate = Date.now();
				});
				return setTimeout(() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`), 1000);
				// eslint-disable-next-line
			} catch (e) {
				return setTimeout(() => {
					instanceState.update((s) => {
						s.lastUpdate = Date.now();
					});
					navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`);
				}, 2000);
			}
		},
		// eslint-disable-next-line
		[mounted]
	);

	useAsyncEffect(async () => {
		if (formState.submitted) {
			if (isURL(formData.csv_url)) {
				setFormState({ uploading: true });
				const uploadJob = await csvURLLoad({ schema, table, csv_url: formData.csv_url, auth, url });
				const uploadJobId = uploadJob.message.replace('Starting job with id ', '');
				setTimeout(() => validateData(uploadJobId), 1000);
			} else {
				setFormState({ error: 'Please provide a valid URL' });
				setTimeout(() => setFormState({}), 2000);
			}
		}
	}, [formState]);

	useAsyncEffect(
		() => setMounted(true),
		() => setMounted(false),
		[]
	);

	return (
		<ErrorBoundary
			onError={(error, componentStack) => addError({ error: { message: error.message, componentStack } })}
			FallbackComponent={ErrorFallback}
		>
			<Row>
				<Col xs="12" lg="4" className="pt-1 pb-2">
					Import A CSV File From URL
					<br />
					<span className="text-small">csv must be publicly accessible</span>
				</Col>
				<Col xs="12" lg="4">
					{formState.error ? (
						<div className="text-danger csv-status">
							<i className="fa fa-exclamation-triangle me-3" />
							{formState.error}
						</div>
					) : formState.uploading ? (
						<div className="csv-status">
							<i className="fa fa-spin fa-spinner me-3" />
							uploading .csv into {schema}.{table}
						</div>
					) : (
						<Input
							onChange={(e) => setFormData({ csv_url: e.target.value })}
							type="text"
							invalid={formData.csv_url && !isURL(formData.csv_url)}
							id="csv_url"
							title="csv url"
							placeholder="CSV file URL"
							value={formData.csv_url || ''}
							disabled={formState.submitted}
						/>
					)}
				</Col>
				<Col xs="12" lg="4">
					{formState.error ? (
						<Button
							id="clearURL"
							block
							color="danger"
							onClick={() => {
								setFormState({});
								setFormData({});
							}}
						>
							Clear URL
						</Button>
					) : (
						<Button
							id="importFromURL"
							disabled={!!Object.keys(formState).length || !isURL(formData.csv_url)}
							block
							color="success"
							onClick={() => setFormState({ submitted: true })}
						>
							Import From URL
						</Button>
					)}
				</Col>
			</Row>
		</ErrorBoundary>
	);
}
export default CsvUploadURL;
