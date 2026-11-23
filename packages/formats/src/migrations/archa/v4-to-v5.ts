import type { RawArcha } from './v1-to-v2';

/**
 * v5 lets image sources (image nodes and image paints) be `asset:` references into the `<name>-asset/`
 * folder beside the file. v4 data: URLs stay valid as they are; the core host writes them out to the
 * folder when the file is opened (no I/O here).
 */
export function v4ToV5(raw: RawArcha): RawArcha {
  return raw;
}
