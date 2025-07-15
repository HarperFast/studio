import { Cluster } from '@/lib/api.patch';

const statusPriority: Record<string, number> = {
  'UPDATING': 0,
  'PROVISIONING': 1,
  'RUNNING': 2,
  'TERMINATED': 3
};

const DEFAULT_PRIORITY = statusPriority.RUNNING;

export function byClusterStatusThenName(a: Cluster, b: Cluster) {
  if (a.status === b.status) {
    return a.name.localeCompare(b.name);
  }

  const priorityA = a.status ? statusPriority[a.status] ?? DEFAULT_PRIORITY : DEFAULT_PRIORITY;
  const priorityB = b.status ? statusPriority[b.status] ?? DEFAULT_PRIORITY : DEFAULT_PRIORITY;
  return priorityA - priorityB;
}
