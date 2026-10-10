export interface ToolConfig {
  repository: string;
  default?: string;
}
export interface Resolutions {
  schemaVersion: number;
  tools: Record<string, { repo: string; ref: string; commit: string }>;
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
