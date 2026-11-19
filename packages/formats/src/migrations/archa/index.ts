import { v1ToV2, type RawArcha } from './v1-to-v2';

export type { RawArcha };

/** Index i migrates formatVersion i+1 → i+2. Pure functions over raw JSON (blueprint FILE_FORMATS/03). */
const MIGRATIONS: Array<(raw: RawArcha) => RawArcha> = [v1ToV2];

export function runMigrations(raw: RawArcha, from: number, to: number): RawArcha {
  let out = raw;
  for (let v = from; v < to; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`No migration from formatVersion ${v}`);
    out = step(out);
  }
  return out;
}
