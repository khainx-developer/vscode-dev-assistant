import type { GitHubViewState } from '../../shared/githubTypes';
import type { JiraViewState } from '../../shared/jiraTypes';
import type { AiProvider } from '../ai/aiSettings';
import {
  deriveGitHubConnection,
  deriveJiraConnection,
  isGitHubSignedIn,
  isJiraConnected,
} from './connectionState';

export type SetupStepId = 'github' | 'monitoring' | 'jira' | 'ai';
export type SetupStepState = 'done' | 'todo' | 'attention' | 'optional' | 'checking';

export interface SetupStep {
  id: SetupStepId;
  title: string;
  state: SetupStepState;
  /** Plain-language status line shown under the step title. */
  detail: string;
}

export interface SetupStatus {
  steps: SetupStep[];
  /** Required steps (GitHub, monitoring, Jira) that are done. */
  completed: number;
  required: number;
}

export function deriveSetupStatus(
  github: GitHubViewState | null,
  jira: JiraViewState | null,
  ai: { provider: AiProvider; modelName: string | null },
): SetupStatus {
  const githubConnection = deriveGitHubConnection(github);
  const jiraConnection = deriveJiraConnection(jira);
  const signedIn = isGitHubSignedIn(githubConnection);

  const githubStep: SetupStep = githubConnection.kind === 'unknown'
    || (githubConnection.kind === 'refreshing' && !signedIn)
    ? { id: 'github', title: 'Sign in to GitHub', state: 'checking', detail: 'Checking your GitHub session…' }
    : githubConnection.kind === 'signingIn'
    ? { id: 'github', title: 'Sign in to GitHub', state: 'checking', detail: 'Waiting for GitHub sign-in in your browser…' }
    : signedIn
    ? { id: 'github', title: 'Sign in to GitHub', state: 'done', detail: `Signed in as ${github?.me ?? 'you'}.` }
    : githubConnection.kind === 'error'
    ? { id: 'github', title: 'Sign in to GitHub', state: 'attention', detail: githubConnection.message }
    : { id: 'github', title: 'Sign in to GitHub', state: 'todo', detail: 'Needed to see pull requests that need your review.' };

  const repoCount = github?.monitoredRepos.length ?? 0;
  const authorCount = github?.monitoredAuthors.length ?? 0;
  const invalid = [...(github?.monitoredRepos ?? []), ...(github?.monitoredAuthors ?? [])]
    .filter((entry) => entry.status === 'invalid').length;
  const monitoringStep: SetupStep = !signedIn
    ? { id: 'monitoring', title: 'Choose repositories & teammates', state: 'todo', detail: 'Sign in to GitHub first.' }
    : invalid > 0
    ? { id: 'monitoring', title: 'Choose repositories & teammates', state: 'attention', detail: `${invalid} entr${invalid === 1 ? 'y' : 'ies'} could not be found — check spelling and access.` }
    : repoCount === 0
    ? { id: 'monitoring', title: 'Choose repositories & teammates', state: 'todo', detail: 'Add at least one repository so DevMate knows where to look.' }
    : { id: 'monitoring', title: 'Choose repositories & teammates', state: 'done', detail: `${plural(repoCount, 'repository', 'repositories')}, ${plural(authorCount, 'teammate', 'teammates')}.` };

  const connected = isJiraConnected(jiraConnection);
  const queryCount = jira?.savedQueries.length ?? 0;
  const jiraStep: SetupStep = jiraConnection.kind === 'unknown'
    ? { id: 'jira', title: 'Connect Jira', state: 'checking', detail: 'Checking your Jira connection…' }
    : jiraConnection.kind === 'connecting'
    ? { id: 'jira', title: 'Connect Jira', state: 'checking', detail: 'Waiting for Atlassian authorization in your browser…' }
    : !connected
    ? jiraConnection.kind === 'error'
      ? { id: 'jira', title: 'Connect Jira', state: 'attention', detail: jiraConnection.message }
      : { id: 'jira', title: 'Connect Jira', state: 'todo', detail: 'Include tickets and due dates in your inbox.' }
    : !jira?.currentUser
    ? { id: 'jira', title: 'Connect Jira', state: 'attention', detail: 'Add your Jira display name so DevMate can find your tickets.' }
    : queryCount === 0
    ? { id: 'jira', title: 'Connect Jira', state: 'attention', detail: 'Add a JQL query to choose which tickets to fetch.' }
    : jiraConnection.kind === 'error'
    ? { id: 'jira', title: 'Connect Jira', state: 'attention', detail: jiraConnection.message }
    : { id: 'jira', title: 'Connect Jira', state: 'done', detail: `Connected to ${hostOf(jira.siteUrl)} as ${jira.currentUser}.` };

  const aiStep: SetupStep = ai.provider === 'none'
    ? { id: 'ai', title: 'AI assistant (optional)', state: 'optional', detail: 'Off. Turn on to get “What should I do next?” and standup summaries.' }
    : { id: 'ai', title: 'AI assistant (optional)', state: 'done', detail: ai.modelName ? `Using ${ai.modelName}.` : 'On — a model is picked automatically when you first ask.' };

  const steps = [githubStep, monitoringStep, jiraStep, aiStep];
  return {
    steps,
    completed: [githubStep, monitoringStep, jiraStep].filter((step) => step.state === 'done').length,
    required: 3,
  };
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function hostOf(url: string | null): string {
  if (!url) return 'Jira';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
