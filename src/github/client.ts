import type { Octokit as OctokitClass } from 'octokit' with { 'resolution-mode': 'import' };
import { GitHubSession, MonitoredAuthor, MonitoredRepo, PullRequestSummary, RateLimitStatus } from './types';

type OctokitCtor = typeof OctokitClass;

// `octokit` ships ESM-only; this project compiles to CommonJS, so the constructor is obtained
// via dynamic import (tsc's own suggested fix for TS1479) instead of a static import.
// Developer Freedom (§19): a test-settable override avoids a module-mocking dependency, while
// production code always constructs a fresh instance per call (no long-lived cached client,
// TechnicalDesign.md §14).
let octokitCtorOverride: OctokitCtor | undefined;

export function setOctokitCtorForTesting(ctor: OctokitCtor | undefined): void {
  octokitCtorOverride = ctor;
}

async function createOctokit(session: GitHubSession) {
  const Ctor = octokitCtorOverride ?? (await import('octokit')).Octokit;
  return new Ctor({ auth: session.accessToken });
}

const OPEN_PULL_REQUESTS_QUERY = `
query OpenPullRequests($owner: String!, $repo: String!) {
  repository(owner: $owner, name: $repo) {
    pullRequests(states: OPEN, first: 50, orderBy: { field: UPDATED_AT, direction: DESC }) {
      nodes {
        number
        title
        url
        author { login }
        state
        isDraft
        mergedAt
        createdAt
        updatedAt
        mergeable
        labels(first: 10) {
          nodes { name color }
        }
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
        reviews(last: 20) {
          nodes { author { login } state submittedAt }
        }
        comments(last: 20) {
          nodes { id author { login } createdAt url }
        }
        reviewRequests(first: 10) {
          nodes { requestedReviewer { ... on User { login } } }
        }
      }
    }
  }
}
`;

interface OpenPullRequestsResponse {
  repository: {
    pullRequests: {
      nodes: Array<{
        number: number;
        title: string;
        url: string;
        author: { login: string } | null;
        state: 'OPEN' | 'MERGED' | 'CLOSED';
        isDraft: boolean;
        mergedAt: string | null;
        createdAt: string;
        updatedAt: string;
        mergeable: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null;
        labels?: { nodes: Array<{ name: string; color: string }> };
        commits?: { nodes: Array<{ commit: { statusCheckRollup: { state: string } | null } }> };
        reviews: { nodes: Array<{ author: { login: string } | null; state: string; submittedAt: string }> };
        comments: { nodes: Array<{ id: string; author: { login: string } | null; createdAt: string; url: string }> };
        reviewRequests: { nodes: Array<{ requestedReviewer: { login: string } | null }> };
      }>;
    };
  };
}

interface RateLimitResponse {
  rateLimit: { remaining: number; resetAt: string };
}

export const GitHubClient = {
  async validateRepo(repo: MonitoredRepo, session: GitHubSession): Promise<boolean> {
    const octokit = await createOctokit(session);
    try {
      await octokit.rest.repos.get({ owner: repo.owner, repo: repo.repo });
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return false;
      }
      throw error;
    }
  },

  async validateAuthor(author: MonitoredAuthor, session: GitHubSession): Promise<boolean> {
    const octokit = await createOctokit(session);
    try {
      await octokit.rest.users.getByUsername({ username: author.username });
      return true;
    } catch (error) {
      if ((error as { status?: number }).status === 404) {
        return false;
      }
      throw error;
    }
  },

  async fetchOpenPullRequests(repo: MonitoredRepo, session: GitHubSession): Promise<PullRequestSummary[]> {
    const octokit = await createOctokit(session);
    const data = await octokit.graphql<OpenPullRequestsResponse>(OPEN_PULL_REQUESTS_QUERY, {
      owner: repo.owner,
      repo: repo.repo,
    });
    const repoKey = `${repo.owner}/${repo.repo}`;

    return data.repository.pullRequests.nodes
      .filter((node) => !node.isDraft)
      .map((node) => ({
        repoKey,
        number: node.number,
        title: node.title,
        url: node.url,
        author: node.author?.login ?? '',
        state: node.state,
        mergedAt: node.mergedAt,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
        mergeable: node.mergeable ?? 'UNKNOWN',
        labels: (node.labels?.nodes ?? []).map((label) => ({ name: label.name, color: label.color })),
        checkStatus: (node.commits?.nodes[0]?.commit.statusCheckRollup?.state ?? null) as PullRequestSummary['checkStatus'],
        reviews: node.reviews.nodes.map((review) => ({
          author: review.author?.login ?? '',
          state: review.state as PullRequestSummary['reviews'][number]['state'],
          submittedAt: review.submittedAt,
        })),
        comments: node.comments.nodes.map((comment) => ({
          id: comment.id,
          author: comment.author?.login ?? '',
          createdAt: comment.createdAt,
          url: comment.url,
        })),
        requestedReviewers: node.reviewRequests.nodes
          .map((request) => request.requestedReviewer?.login)
          .filter((login): login is string => login !== undefined && login !== null),
      }));
  },

  async getRateLimitStatus(session: GitHubSession): Promise<RateLimitStatus> {
    const octokit = await createOctokit(session);
    const data = await octokit.graphql<RateLimitResponse>('query { rateLimit { remaining resetAt } }');
    return { remaining: data.rateLimit.remaining, resetAt: data.rateLimit.resetAt };
  },
};
