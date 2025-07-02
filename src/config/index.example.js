export default {
	studio_version: 'x.x.xx',
	env: 'dev',
	stripe_public_key: 'pk_test_XXXXXXXXXXXXXXXXXXXXXX',
	lms_api_url: 'https://dev.harperdbcloudservices.com/',
	google_analytics_code: 'UA-XXXXXXXXXXXXX-3',
	tc_version: '2020-01-01',
	check_version_interval: 300000,
	check_user_interval: 900000,
	refresh_content_interval: 10000,
	free_cloud_instance_limit: 1,
	max_file_upload_size: 10380902,
	alarm_badge_threshold: 86400,
	maintenance: 0,
	is_local_studio: process.env.REACT_APP_LOCALSTUDIO, // this is injected at build-time and loads LocalApp.js instead of App.js
	local_studio_dev_url: 'http://localhost:9925', // this lets you dev the UI on port 3000 and talk to your local instance on 9925
	reo_dev_client_id: 'XXXXXXXXXXXXX',
};
