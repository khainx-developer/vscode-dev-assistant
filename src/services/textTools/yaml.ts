import type { DumpOptions, LoadOptions, YAMLException } from 'js-yaml';

type JsYaml = typeof import('js-yaml');

let jsYaml: JsYaml | undefined;

/** Lazy require: defers startup only; does not shrink the single-file CJS bundle. */
function getJsYaml(): JsYaml {
  if (!jsYaml) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    jsYaml = require('js-yaml') as JsYaml;
  }
  return jsYaml;
}

const DUMP_OPTIONS: DumpOptions = {
  indent: 2,
  lineWidth: -1,
  noRefs: true,
  // Default dump already quotes strings YAML would misread (yes/null/true/123)
  // and uses block style for multi-line strings.
};

function loadOptions(): LoadOptions {
  // js-yaml v4 DEFAULT_SCHEMA is safe (no !!js/*) and still parses timestamps
  // to Date so JSON.stringify yields ISO strings.
  return { schema: getJsYaml().DEFAULT_SCHEMA };
}

function isBlankOrCommentsOnly(input: string): boolean {
  for (const line of input.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    if (trimmed === '---' || trimmed === '...') {
      continue;
    }
    return false;
  }
  return true;
}

function formatJsonError(err: unknown): Error {
  if (err instanceof SyntaxError) {
    return new Error(err.message);
  }
  if (err instanceof Error) {
    return new Error(err.message);
  }
  return new Error('Invalid JSON.');
}

function formatYamlError(err: unknown): Error {
  if (err && typeof err === 'object' && 'reason' in err) {
    const ye = err as YAMLException;
    const reason = (ye.reason || String(ye.message).split('\n')[0]).trim();
    if (ye.mark) {
      const line = ye.mark.line + 1;
      const column = ye.mark.column + 1;
      return new Error(`Invalid YAML at line ${line}, column ${column}: ${reason}`);
    }
    return new Error(`Invalid YAML: ${reason}`);
  }
  if (err instanceof Error) {
    const firstLine = err.message.split('\n')[0].trim();
    return new Error(`Invalid YAML: ${firstLine}`);
  }
  return new Error('Invalid YAML.');
}

/**
 * Convert JSON text to YAML. Dumps with 2-space indent, no wrapping, noRefs.
 * Preserves key order. Quotes / block-styles strings YAML would misread.
 */
export function jsonToYaml(input: string): string {
  if (!input.trim()) {
    throw new Error('Paste JSON to convert.');
  }

  let value: unknown;
  try {
    value = JSON.parse(input);
  } catch (err) {
    throw formatJsonError(err);
  }

  const { dump } = getJsYaml();
  return dump(value, DUMP_OPTIONS);
}

/**
 * Convert YAML text to pretty-printed JSON. Safe schema only (rejects !!js/*).
 * Multi-document input becomes a JSON array. Anchors/aliases are resolved;
 * comments are dropped.
 */
export function yamlToJson(input: string): string {
  if (isBlankOrCommentsOnly(input)) {
    throw new Error('Paste YAML to convert.');
  }

  const { loadAll } = getJsYaml();
  const docs: unknown[] = [];
  try {
    loadAll(input, (doc) => docs.push(doc), loadOptions());
  } catch (err) {
    throw formatYamlError(err);
  }

  if (docs.length === 0) {
    throw new Error('Paste YAML to convert.');
  }

  const value = docs.length === 1 ? docs[0] : docs;
  return JSON.stringify(value, null, 2);
}
