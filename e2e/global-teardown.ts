/*
 * Enforce the mutation ledger: a recorded kill that nobody performed fails the
 * run.
 *
 * §4.1c asks that every `observed` record be written by the thing that ran it.
 * This is the other half, and the half that keeps the first half honest. The
 * ledger in `mutations/LEDGER.json` is written by `scripts/mutate.mjs` and quoted
 * in `README.md`; without this file it would be an archive, and an archive rots
 * silently. Here, a ledger entry naming a test that no longer asserts its marker
 * fails the suite — so a kill can only stay recorded while the assertion that
 * produced it still exists.
 *
 * WHY IT ONLY RUNS WHEN THE CLAIMS PROJECT RAN. The sink is per-run, so a run of
 * the a11y project alone legitimately contains no claims entries. Playwright
 * filters `config.projects` to the SELECTED projects, so asking whether `claims`
 * is in that list is asking whether those tests were supposed to have run.
 *
 * WHY `MUTATION_RUN` SKIPS IT. `scripts/mutate.mjs` runs one test at a time while
 * BUILDING the ledger, so the ledger is deliberately out of step with the sink
 * for the duration. The runner's final act is a full claims pass without that
 * flag, which is what validates the ledger it just wrote.
 */
import type { FullConfig } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { key, readSink } from './evidence';

interface LedgerKill {
  readonly id: string;
  readonly verdict: string;
  readonly owningTest: string;
  readonly marker: string;
  readonly outcome: string;
}

export default function globalTeardown(config: FullConfig): void {
  if (process.env.MUTATION_RUN) return;
  if (!config.projects.some((p) => p.name === 'claims')) return;
  if (!existsSync('mutations/LEDGER.json')) return;

  const ledger = JSON.parse(readFileSync('mutations/LEDGER.json', 'utf8')) as {
    mutations: LedgerKill[];
  };
  const kills = ledger.mutations.filter((m) => m.outcome === 'KILLED');
  if (kills.length === 0) return;

  const performed = readSink();
  const unperformed = kills
    .filter((m) => !performed.has(key(m.owningTest, m.marker)))
    .map((m) => `${m.id}: recorded as killed by "${m.owningTest}" on marker "${m.marker}"`);

  if (unperformed.length > 0) {
    throw new Error(
      'mutations/LEDGER.json records kills whose (test, marker) pair never ran in this ' +
        'suite. Either the assertion was removed and the record is now false, or the ' +
        'test was renamed and the ledger needs regenerating with `npm run mutations`:\n  ' +
        unperformed.join('\n  ')
    );
  }
}
