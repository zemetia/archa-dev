import type { Op } from '@archa/schema';
import { commit } from '../../lib/store';

/** One transaction that patches every listed node the same way. */
export const patchNodes = (ids: string[], patch: Record<string, unknown>, label: string) =>
  commit(label, ids.map((id): Op => ({ op: 'update', id, patch })));
