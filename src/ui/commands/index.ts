import { DevUtilityCommand } from '../commandTypes';
import { encodingCommands } from './encoding';
import { jsonCommands } from './json';
import { idAndTimeCommands } from './idAndTime';

export const allCommands: DevUtilityCommand[] = [
  ...encodingCommands,
  ...jsonCommands,
  ...idAndTimeCommands,
];
