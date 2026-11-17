import type { PullRequestSummary } from '../../shared/githubTypes';

export class PullRequestCache {
  private readonly byRepo = new Map<string, PullRequestSummary[]>();

  setForRepo(repoKey: string, prs: PullRequestSummary[]): void {
    this.byRepo.set(repoKey, prs);
  }

  getAll(): PullRequestSummary[] {
    return [...this.byRepo.values()].flat();
  }
}
