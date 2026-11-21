import { DevUtilityCommand } from '../commandTypes';
import { encodingCommands } from './encoding';
import { jsonCommands } from './json';
import { idAndTimeCommands } from './idAndTime';
import { runToolCommands } from './runTool';

export const allCommands: DevUtilityCommand[] = [
  ...encodingCommands,
  ...jsonCommands,
  ...idAndTimeCommands,
  ...runToolCommands,
];
