import getConfiguration from '../../api/instance/getConfiguration';
import listRoles from '../../api/instance/listRoles';
import listUsers from '../../api/instance/listUsers';
import registrationInfo from '../../api/instance/registrationInfo';
import clusterStatus from '../../api/instance/clusterStatus';

const checkClusterStatus = async ({ auth, url }) => {
  const config = await getConfiguration({ auth, url });
  const registration = await registrationInfo({ auth, url });
  const clustering = await clusterStatus({ auth, url });
  const clusterEngine = parseFloat(registration?.version) >= 4 ? 'nats' : 'socketcluster';

  const roles = await listRoles({ auth, url });
  let cluster_role = false;
  if (!roles.error) {
    cluster_role = roles.find((r) => r.permission.cluster_user);
  }
  const users = await listUsers({ auth, url });
  let cluster_user = false;
  if (!users.error) {
    cluster_user = cluster_role && users.find((u) => u.role === cluster_role.role);
  }
  const is_enabled = clusterEngine === 'nats' ? config.clustering?.enabled : config.CLUSTERING;
  const config_cluster_user = clusterEngine === 'nats' ? config.clustering?.user : config.CLUSTERING_USER;
  const config_cluster_port = clusterEngine === 'nats' ? config.clustering?.hubServer?.cluster?.network?.port : config.CLUSTERING_PORT;
  const node_name = clusterEngine === 'nats' ? config.clustering?.nodeName : config.NODE_NAME;

  const is_ready = !!is_enabled && !!cluster_user && !!config_cluster_user && !!cluster_role && !!config_cluster_port && !!node_name;

  return {
    is_ready,
    cluster_role,
    cluster_user,
    is_enabled,
    config_cluster_user,
    config_cluster_port,
    node_name,
    engine: clusterEngine,
    status: clustering?.status,
    message: clustering?.message,
    connections: clustering?.connections,
  };
};

export default checkClusterStatus;
