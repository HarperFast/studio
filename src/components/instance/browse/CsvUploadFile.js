import React, { useState, useCallback } from 'react';
import { Button, Col, Row } from 'reactstrap';
import { useNavigate, useParams } from 'react-router-dom';
import { useStoreState } from 'pullstate';
import Dropzone from 'react-dropzone';
import useAsyncEffect from 'use-async-effect';
import { ErrorBoundary } from 'react-error-boundary';

import instanceState from '../../../functions/state/instanceState';
import config from '../../../config';
import getJob from '../../../functions/api/instance/getJob';
import csvDataLoad from '../../../functions/api/instance/csvDataLoad';
import commaNumbers from '../../../functions/util/commaNumbers';
import addError from '../../../functions/api/lms/addError';
import ErrorFallback from '../../shared/ErrorFallback';

function CsvUploadFile() {
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
						message.indexOf('transaction aborted due to record(s) with a hash value that contains a forward slash') !==
						-1
					) {
						return setFormState({ error: 'The CSV file contains a row with a forward slash in the hash field.' });
					}
					if (message.indexOf('Invalid column name') !== -1) {
						return setFormState({ error: 'The CSV file contains an invalid column name.' });
					}
					return setFormState({ error: message });
				}
				if (status !== 'COMPLETE' && mounted) {
					return setTimeout(() => validateData(uploadJobId), 1000);
				}
				return setTimeout(() => navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`), 1000);
				// eslint-disable-next-line
			} catch (e) {
				return setTimeout(() => {
					navigate(`/o/${customer_id}/i/${compute_stack_id}/browse/${schema}/${table}`);
				}, 2000);
			}
		},
		[mounted] // eslint-disable-line
	);

	const onDrop = useCallback((acceptedFiles) => {
		acceptedFiles.forEach((file) => {
			const reader = new FileReader();
			reader.onabort = () => setFormState({ error: 'File reading was aborted' });
			reader.onerror = () => setFormState({ error: 'file reading has failed' });
			reader.onload = () => {
				setFormState({ processing: true });
				const lines = reader.result.split(/\r\n|\n/).filter((l) => l.trim().length).length - 1;
				setFormData({ records: lines, csv_file: reader.result });
				setFormState({ processed: true });
			};
			if (file.size > config.max_file_upload_size)
				setFormState({ error: 'File exceeds 10MB Limit. Use URL Loader Above.' });
			else reader.readAsText(file);
		});
	}, []);

	useAsyncEffect(async () => {
		if (formState.submitted) {
			if (formData.csv_file) {
				setFormState({ uploading: true });
				const uploadJob = await csvDataLoad({ schema, table, csv_file: formData.csv_file, auth, url });
				const uploadJobId = uploadJob.message.replace('Starting job with id ', '');
				setTimeout(() => validateData(uploadJobId), 1000);
			} else {
				setFormState({ error: 'Please select a valid CSV file' });
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
					Upload A CSV File
					<br />
					<span className="text-small">from your computer (10MB limit)</span>
				</Col>
				<Col xs="12" lg="4">
					{formState.error ? (
						<div className="text-danger csv-status">{formState.error}</div>
					) : formState.uploading ? (
						<div className="csv-status">
							<i className="fa fa-spin fa-spinner me-3" />
							inserting {commaNumbers(formData.records)} records into {schema}.{table}
						</div>
					) : formState.processed ? (
						<Button
							id="replaceFile"
							block
							color="default"
							onClick={() => {
								setFormState({});
								setFormData({});
							}}
						>
							<span className="text-nowrap text-small">
								<i className="fa fa-thumbs-up text-success me-3" />
								{commaNumbers(formData.records)} records. Click here to replace file.
							</span>
						</Button>
					) : formState.processing ? (
						<div className="csv-status">
							<i className="fa fa-spin fa-spinner" /> processing {commaNumbers(formData.records)} records
						</div>
					) : (
						<Dropzone onDrop={onDrop}>
							{({ getRootProps, getInputProps }) => (
								<div {...getRootProps()} className="drop-zone">
									<input {...getInputProps()} />
									Click or Drag to select a .csv file
								</div>
							)}
						</Dropzone>
					)}
				</Col>
				<Col xs="12" lg="4">
					{formState.error ? (
						<Button
							id="clearFile"
							color="danger"
							block
							className="px-5 clear-files"
							onClick={() => {
								setFormState({});
								setFormData({});
							}}
						>
							Clear File
						</Button>
					) : (
						<Button
							id="insertRecords"
							block
							disabled={formState.uploading || !formData.csv_file}
							color="success"
							onClick={() => setFormState({ submitted: true })}
						>
							Insert {commaNumbers(formData.records)} Records
						</Button>
					)}
				</Col>
			</Row>
		</ErrorBoundary>
	);
}
export default CsvUploadFile;
