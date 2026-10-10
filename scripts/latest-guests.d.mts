export interface ToolConfig {
  repository: string;
  default?: string;
}
export interface ReleaseAsset {
  name: string;
  url: string;
  sha256: string;
  size: number;
}
export function releaseBinary(
  archive: Uint8Array,
  tool: string,
  asset: ReleaseAsset,
): Uint8Array;
export interface Resolutions {
  schemaVersion: number;
  tools: Record<
    string,
    { repo: string; ref: string; commit: string; releaseAsset?: ReleaseAsset }
  >;
}
export function resolveLatest(
  tools: Record<string, ToolConfig>,
  api?: (endpoint: string) => unknown | Promise<unknown>,
): Promise<Resolutions>;
export function validateLatest(
  tools: Record<string, ToolConfig>,
  builds: {
    builds: Record<
      string,
      Record<
        string,
        { ref: string; source: { url: string; ref: string; commit: string } }
      >
    >;
  },
  resolutions: Resolutions,
  registered: Record<string, ToolConfig>,
): void;
