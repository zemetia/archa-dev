import type { RawArcha } from './v1-to-v2';

/** v3 only adds values (inner-shadow, layer-blur and background-blur effects; justify "space-around"): v2 data is valid v3. */
export function v2ToV3(raw: RawArcha): RawArcha {
  return raw;
}
