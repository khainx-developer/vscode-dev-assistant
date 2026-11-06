import { DevUtilityCommand } from '../commandTypes';
import { encodingCommands } from './encoding';
import { jsonCommands } from './json';
import { caseTransformCommands } from './caseTransform';
import { idAndTimeCommands } from './idAndTime';

export const allCommands: DevUtilityCommand[] = [
  ...encodingCommands,
  ...jsonCommands,
  ...caseTransformCommands,
  ...idAndTimeCommands,
];
