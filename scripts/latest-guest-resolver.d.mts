export function validateUnmodifiedProvenance(
  info: unknown,
  build: {
    tool: string;
    ref: string;
    built_at: string;
    source: { type: string; url: string; ref: string; commit: string };
  },
): unknown;
