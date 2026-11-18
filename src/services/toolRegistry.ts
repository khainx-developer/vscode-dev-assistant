import { ToolDefinition } from '../shared/toolTypes';
import { base64Encode, base64Decode } from './textTools/base64';
import { urlEncode, urlDecode } from './textTools/url';
import { formatJson, jsonEscapeString } from './textTools/json';
import { jsonToYaml, yamlToJson } from './textTools/yaml';
import { generateUuid } from './textTools/uuid';
import { describeTimestamp } from './textTools/timestamp';
import { decodeJwt } from './textTools/jwt';
import { hashText } from './textTools/hash';

const BASE64_PATTERN = /^[A-Za-z0-9+/\s]*={0,2}\s*$/;

export const tools: ToolDefinition[] = [
  {
    id: 'uuid-generator',
    title: 'UUID Generator',
    description: 'Generate a random UUID (v4) and copy it to the clipboard.',
    icon: 'id',
    category: 'code',
    tags: ['uuid', 'generator', 'id'],
    needsInput: false,
    actions: [{ id: 'generate', label: 'Generate UUID' }],
    run: () => generateUuid(),
  },
  {
    id: 'timestamp-converter',
    title: 'Date / Timestamp Converter',
    description:
      'Show a moment as Unix timestamps and in UTC, your local zone, and any IANA zones you list.',
    icon: 'clock',
    category: 'code',
    tags: ['date', 'time', 'timestamp', 'convert', 'timezone'],
    needsInput: true,
    inputPlaceholder: '<value> [in <zone>[, <zone>...]] — e.g. 1700000000 in Asia/Tokyo, Europe/London',
    actions: [
      { id: 'now', label: 'Current time' },
      { id: 'convert', label: 'Convert' },
    ],
    run: (action, input) => describeTimestamp(input, action),
  },
  {
    id: 'json-formatter',
    title: 'JSON Formatter',
    description: 'Pretty-print JSON, or escape text as a JSON string literal.',
    icon: 'braces',
    category: 'code',
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
    id: 'json-yaml',
    title: 'JSON ↔ YAML',
    description: 'Convert between JSON and YAML.',
    icon: 'file-code',
    category: 'code',
    tags: ['json', 'yaml', 'convert', 'config'],
    needsInput: true,
    inputPlaceholder:
      'Paste JSON or YAML… Comments are dropped; multi-document YAML becomes a JSON array; integers beyond 2^53 lose precision in both directions. YAML values with no JSON form change silently (.nan/.inf → null; non-string keys → strings like "a,b").',
    actions: [
      { id: 'jsonToYaml', label: 'JSON → YAML' },
      { id: 'yamlToJson', label: 'YAML → JSON' },
    ],
    run: (action, input) => (action === 'yamlToJson' ? yamlToJson(input) : jsonToYaml(input)),
  },
  {
    id: 'base64-tool',
    title: 'Base64 Encoder/Decoder',
    description: 'Encode or decode Base64 strings.',
    icon: 'lock',
    category: 'api',
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
    icon: 'link',
    category: 'api',
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
    id: 'jwt-decoder',
    title: 'JWT Decoder',
    description: 'Decode a JWT header and payload. Decode only — never verifies the signature.',
    icon: 'key',
    category: 'api',
    tags: ['jwt', 'token', 'auth', 'decode'],
    needsInput: true,
    inputPlaceholder: 'Paste a JWT to decode (decode only — signature is not verified)...',
    actions: [{ id: 'decode', label: 'Decode JWT' }],
    run: (_action, input) => decodeJwt(input),
  },
  {
    id: 'hash-tool',
    title: 'Hash',
    description:
      'Hash text with SHA-256, SHA-1, MD5, or SHA-512. Digests the text exactly as typed, including a trailing newline. The panel uses \\n, so text pasted from a Windows file that still has \\r\\n will hash differently from the file on disk. MD5 and SHA-1 are for checksums, not security.',
    icon: 'hash',
    category: 'api',
    tags: ['hash', 'sha256', 'sha1', 'md5', 'sha512', 'checksum', 'digest'],
    needsInput: true,
    inputPlaceholder: 'Enter text to hash...',
    actions: [
      { id: 'all', label: 'All hashes' },
      { id: 'sha256', label: 'SHA-256' },
      { id: 'sha1', label: 'SHA-1' },
      { id: 'md5', label: 'MD5' },
      { id: 'sha512', label: 'SHA-512' },
    ],
    run: (action, input) => hashText(action, input),
  },
];

export function getToolById(id: string): ToolDefinition | undefined {
  return tools.find((t) => t.id === id);
}
