import { Cluster } from '@/lib/api.patch';

const statusPriority: Record<string, number> = {
  'FAILED': 0,
  'UPDATING': 1,
  'PROVISIONING': 2,
  'RUNNING': 3,
  'TERMINATED': 4
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
