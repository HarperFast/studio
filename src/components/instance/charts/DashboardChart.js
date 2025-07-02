import React, { useState } from 'react';
import { Col, Card, CardBody, Button, ButtonGroup } from 'reactstrap';
import { useStoreState } from 'pullstate';
import { useParams } from 'react-router-dom';
import Chart from 'react-apexcharts';
import useAsyncEffect from 'use-async-effect';

import useInterval from 'use-interval';
import instanceState from '../../../functions/state/instanceState';
import appState from '../../../functions/state/appState';

import sql from '../../../functions/api/instance/sql';
import chartOptions from '../../../functions/charts/chartOptions';
import isNumeric from '../../../functions/util/isNumeric';
import config from '../../../config';

function DashboardChart({
	chart: { query, name, id, type, labelAttribute, seriesAttributes, user_id },
	removeChart,
	confirmDelete,
	setConfirmDelete,
}) {
	const { compute_stack_id } = useParams();
	const auth = useStoreState(instanceState, (s) => s.auth, [compute_stack_id]);
	const url = useStoreState(instanceState, (s) => s.url, [compute_stack_id]);
	const theme = useStoreState(appState, (s) => s.theme);
	const canDelete = useStoreState(appState, (s) => s.auth?.user_id === user_id);
	const [chartData, setChartData] = useState(false);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState(false);
	const options =
		chartData &&
		!chartData.error &&
		chartOptions({ title: name, type, labels: chartData.map((d) => d[labelAttribute]), theme });
	const series =
		!chartData || chartData.error
			? []
			: type === 'single value'
				? chartData[0][seriesAttributes[0]]
				: ['donut', 'pie'].includes(type)
					? chartData.map((d) => d[seriesAttributes[0]])
					: seriesAttributes.map((s) => ({ name: s, data: chartData.map((d) => d[s]) }));
	let controller;

	const getChartData = async () => {
		if (auth) {
			setLoading(true);
			if (controller) controller.abort();
			controller = new AbortController();
			const newChartData = await sql({ sql: query, auth, url, signal: controller.signal });

			if (!newChartData.error && newChartData.length) {
				const columns = Object.keys(newChartData[0]);
				const necessaryColumns = type === 'single value' ? seriesAttributes : [labelAttribute, ...seriesAttributes];
				if (!necessaryColumns.every((v) => columns.includes(v))) {
					setChartData({
						error: true,
						message: 'You do not have permission to access some of the data required to render this chart.',
					});
				} else {
					setChartData(newChartData);
				}
			} else {
				setChartData(newChartData);
			}
			setLoading(false);
		}
	};

	useAsyncEffect(
		() => getChartData(),
		() => controller && controller.abort(),
		[]
	);

	useInterval(getChartData, config.refresh_content_interval);

	const handleRemoveChart = (chartId) => {
		setDeleting(true);
		removeChart(chartId);
	};

	return chartData.error ? (
		<Col lg="6" xs="12" className="mb-3" key={name}>
			<Card className="dashboard-chart">
				<CardBody className="text-nowrap position-relative">
					{confirmDelete === id ? (
						<ButtonGroup size="sm" className="chart-remove-confirm">
							<Button
								disabled={deleting}
								title="Remove this chart"
								color="success"
								onClick={() => handleRemoveChart(confirmDelete)}
							>
								{deleting ? 'deleting chart' : 'confirm delete chart'}{' '}
								<i className={`ms-2 fa ${deleting ? 'fa-spinner fa-spin' : 'fa-check'}`} />
							</Button>
							<Button
								disabled={deleting}
								title="Do not remove this chart"
								color="danger"
								onClick={() => setConfirmDelete(false)}
							>
								cancel <i className="ms-2 fa fa-times" />
							</Button>
						</ButtonGroup>
					) : (
						<Button
							title="Remove this chart"
							className="chart-remove"
							color="link"
							onClick={() => setConfirmDelete(id)}
						>
							<i className="fa fa-times text-darkgrey" />
						</Button>
					)}
					<div className="dashboard single-value-chart">
						<div className="title">Error Loading Chart</div>
						<div>{chartData.message}</div>
						<div className="mt-3">You may remove this chart by clicking the &quot;x&quot;</div>
					</div>
				</CardBody>
			</Card>
		</Col>
	) : (
		<Col lg="6" xs="12" className="mb-3" key={name}>
			<Card className="dashboard-chart">
				<CardBody className="text-nowrap position-relative">
					{loading && (
						<Button disabled title="loading" className="chart-loading" color="link">
							<i className="fa fa-spinner fa-spin text-darkgrey" />
						</Button>
					)}
					{confirmDelete === id ? (
						<ButtonGroup size="sm" className="chart-remove-confirm">
							<Button
								disabled={deleting}
								title="Remove this chart"
								color="success"
								onClick={() => handleRemoveChart(confirmDelete)}
							>
								{deleting ? 'deleting chart' : 'confirm delete chart'}{' '}
								<i className={`ms-2 fa ${deleting ? 'fa-spinner fa-spin' : 'fa-check'}`} />
							</Button>
							<Button
								disabled={deleting}
								title="Do not remove this chart"
								color="danger"
								onClick={() => setConfirmDelete(false)}
							>
								cancel <i className="ms-2 fa fa-times" />
							</Button>
						</ButtonGroup>
					) : canDelete ? (
						<Button
							title="Remove this chart"
							className="chart-remove"
							color="link"
							onClick={() => setConfirmDelete(id)}
						>
							<i className="fa fa-times text-darkgrey" />
						</Button>
					) : null}
					{chartData && type === 'single value' ? (
						<div className="dashboard single-value-chart">
							<div className="title">{name}</div>
							<h1>{isNumeric(series) ? series.toFixed(2) : series}</h1>
						</div>
					) : chartData ? (
						<Chart options={options} series={series} type={type} height={220} />
					) : null}
				</CardBody>
			</Card>
		</Col>
	);
}

export default DashboardChart;
