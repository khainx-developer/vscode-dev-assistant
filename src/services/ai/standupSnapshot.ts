import type { AttentionInboxItem } from '../attention/attentionInboxBuilder';
import type { GitHubViewState } from '../../shared/githubTypes';
import type { JiraTask, JiraViewState } from '../../shared/jiraTypes';
import type { StandupSnapshot } from './prompts';

/** Collect the curated inputs for a standup: my PRs, teammates' PRs I'm involved in, my tickets. */
export function buildStandupSnapshot(
  github: GitHubViewState | null,
  jira: JiraViewState | null,
  attention: AttentionInboxItem[],
): StandupSnapshot {
  const me = github?.me?.toLowerCase() ?? null;
  const myPullRequests = github?.authenticated ? github.attention.myPRs : [];
  const reviewingPullRequests = github?.authenticated && me
    ? github.attention.teamPRs.filter((item) =>
      item.pr.requestedReviewers.some((reviewer) => reviewer.toLowerCase() === me)
      || item.pr.reviews.some((review) => review.author.toLowerCase() === me))
    : [];

  const currentUser = jira?.currentUser?.trim().toLowerCase();
  const tasks = new Map<string, JiraTask>();
  if (jira?.connected && currentUser) {
    for (const queryTasks of Object.values(jira.tasksByQuery)) {
      for (const task of queryTasks) {
        if (task.assignee?.trim().toLowerCase() === currentUser && !tasks.has(task.key)) {
          tasks.set(task.key, task);
        }
      }
    }
  }

  return {
    me: { github: github?.me ?? null, jira: jira?.currentUser ?? null },
    myPullRequests,
    reviewingPullRequests,
    myTasks: [...tasks.values()].sort((left, right) => (right.updatedAt ?? '').localeCompare(left.updatedAt ?? '')),
    attention,
  };
}
