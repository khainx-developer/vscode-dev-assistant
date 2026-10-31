import { ToolDefinition } from './types';
import { base64Encode, base64Decode } from '../core/base64';
import { urlEncode, urlDecode } from '../core/url';
import { formatJson, jsonEscapeString } from '../core/json';
import { toUpperCase, toLowerCase, toCamelCase, toSnakeCase, toKebabCase } from '../core/caseTransform';
import { generateUuid } from '../core/uuid';
import { currentUnixTimestamp, unixTimestampToIso } from '../core/timestamp';

const BASE64_PATTERN = /^[A-Za-z0-9+/\s]*={0,2}\s*$/;

export const tools: ToolDefinition[] = [
  {
    id: 'uuid-generator',
    title: 'UUID Generator',
    description: 'Generate a random UUID (v4) and copy it to the clipboard.',
    icon: '🆔',
    category: 'generators',
    tags: ['uuid', 'generator', 'id'],
    needsInput: false,
    actions: [{ id: 'generate', label: 'Generate UUID' }],
    run: () => generateUuid(),
  },
  {
    id: 'timestamp-converter',
    title: 'Date / Timestamp Converter',
    description: 'Get the current Unix timestamp, or convert one to an ISO date.',
    icon: '⏰',
    category: 'converters',
    tags: ['date', 'time', 'timestamp', 'convert'],
    needsInput: true,
    inputPlaceholder: 'Enter a Unix timestamp (seconds or milliseconds)...',
    actions: [
      { id: 'now', label: 'Current Timestamp' },
      { id: 'toIso', label: 'Timestamp → ISO Date' },
    ],
    run: (action, input) => {
      if (action === 'now') {
        const seconds = currentUnixTimestamp();
        return `${seconds} (seconds)\n${new Date().toISOString()} (ISO)`;
      }
      return unixTimestampToIso(input);
    },
  },
  {
    id: 'base64-tool',
    title: 'Base64 Encoder/Decoder',
    description: 'Encode or decode Base64 strings.',
    icon: '🔐',
    category: 'encoders',
    tags: ['base64', 'encode', 'decode'],
    needsInput: true,
    inputPlaceholder: 'Enter text to encode, or Base64 to decode...',
    actions: [
      { id: 'encode', label: 'Encode' },
      { id: 'decode', label: 'Decode' },
    ],
    run: (action, input) => {
      if (action === 'encode') {
        return base64Encode(input);
      }
      if (!BASE64_PATTERN.test(input)) {
        throw new Error('Input is not valid Base64.');
      }
      return base64Decode(input);
    },
  },
  {
    id: 'url-tool',
    title: 'URL Encoder/Decoder',
    description: 'Encode or decode URL components.',
    icon: '🌐',
    category: 'encoders',
    tags: ['url', 'encode', 'decode'],
    needsInput: true,
    inputPlaceholder: 'Enter text or a URL-encoded string...',
    actions: [
      { id: 'encode', label: 'Encode' },
      { id: 'decode', label: 'Decode' },
    ],
    run: (action, input) => (action === 'encode' ? urlEncode(input) : urlDecode(input)),
  },
  {
    id: 'json-formatter',
    title: 'JSON Formatter',
    description: 'Pretty-print JSON, or escape text as a JSON string literal.',
    icon: '📋',
    category: 'formatters',
    tags: ['json', 'format', 'pretty print'],
    needsInput: true,
    inputPlaceholder: 'Paste JSON or text here...',
    actions: [
      { id: 'format', label: 'Format JSON' },
      { id: 'escape', label: 'Escape as String' },
    ],
    run: (action, input) => (action === 'format' ? formatJson(input) : jsonEscapeString(input)),
  },
  {
    id: 'case-converter',
    title: 'Case Converter',
    description: 'Convert text between UPPERCASE, lowercase, camelCase, snake_case and kebab-case.',
    icon: '🔤',
    category: 'formatters',
    tags: ['case', 'text', 'transform'],
    needsInput: true,
    inputPlaceholder: 'Enter text to convert...',
    actions: [
      { id: 'upper', label: 'UPPERCASE' },
      { id: 'lower', label: 'lowercase' },
      { id: 'camel', label: 'camelCase' },
      { id: 'snake', label: 'snake_case' },
      { id: 'kebab', label: 'kebab-case' },
    ],
    run: (action, input) => {
      switch (action) {
        case 'upper':
          return toUpperCase(input);
        case 'lower':
          return toLowerCase(input);
        case 'camel':
          return toCamelCase(input);
        case 'snake':
          return toSnakeCase(input);
        case 'kebab':
          return toKebabCase(input);
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  },
];

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id);
}
