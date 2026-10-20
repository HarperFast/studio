import { getOperationInfo } from '@/features/instance/config/roles/operations/operationsCatalog';
import { isReadOperation } from '@/integrations/api/isReadOperation';

/**
 * A read Harper itself defines. The name alone is not enough: a component can register an
 * operation called `get_and_rotate_key`, so anything outside Studio's catalog of Harper's own
 * operations is treated as able to change something.
 */
export function isBuiltInRead(operation: string): boolean {
	return isReadOperation(operation) && getOperationInfo(operation) !== undefined;
}
