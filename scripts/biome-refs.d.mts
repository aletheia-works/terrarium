export interface BiomeRefInput {
  repository: string;
  ref: string;
  name?: string;
  fixture?: string;
  expected?: { semicolons: string; quoteStyle: string };
}
export interface BiomeRef extends BiomeRefInput {
  repo: string;
  commit: string;
  name: string;
  fixture: string;
  pr?: string;
}
export function resolveBiomeRef(
  input: BiomeRefInput,
  api?: (endpoint: string) => Promise<unknown>,
): Promise<BiomeRef>;
export function stageBiomeRef(
  resolved: BiomeRef,
  binaries: string,
  site: string,
  resolver: string,
): Promise<void>;
