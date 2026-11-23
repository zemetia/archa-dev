import type { RawArcha } from './v1-to-v2';

/**
 * v3 lets image `src` point into the `<name>-asset/` folder (`asset:images/…`). v2 data: URLs stay valid
 * as they are; the core host writes them out to the folder when the file is opened (no I/O here).
 */
export function v2ToV3(raw: RawArcha): RawArcha {
  return raw;
}
