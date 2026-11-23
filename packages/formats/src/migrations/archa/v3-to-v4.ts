import type { RawArcha } from './v1-to-v2';

/** v4 only adds values (gradient and image paints, text `spans`, optional `bindings`): v3 data is valid v4. */
export function v3ToV4(raw: RawArcha): RawArcha {
  return raw;
}
