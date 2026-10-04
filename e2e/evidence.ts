/*
 * The run-scoped sink that makes a mutation record UNFORGEABLE.
 *
 * §4.1c of the build standard asks that every `observed` record be written by the
 * thing that ran it, never typed. Writing them is the easy half. The half that
 * matters is this: an archived record is only worth something if an UNPERFORMED
 * record fails the suite. Otherwise the ledger is a second copy of an answer
 * nobody is checking, and a kill that stopped happening stays recorded forever.
 *
 * So each claims test that asserts a verdict marker calls `witness()`, which
 * appends the (test, marker) pair it actually executed to a file.
 * `global-teardown.ts` then reads `mutations/LEDGER.json` and fails the run if any
 * recorded kill names a pair that never appeared in the sink.
 *
 * `crypto-lab-privacy-pass` writes its observed lines into its ledger;
 * `crypto-lab-hidden-bit` and `crypto-lab-pqxdh-wire` deliberately do not, and
 * their reason is the better one — enforcement is the requirement, archival is a
 * choice. This lab does both, because `README.md` quotes the ledger, and a quoted
 * record that nothing enforces is exactly the drift this file prevents.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const SINK = 'test-results/verdict-sink.jsonl';

/** One key per (test, marker) pair. The separator cannot occur in a marker. */
export const key = (test: string, marker: string): string => `${test} >> ${marker}`;

/**
 * Record that this test really asserted this marker.
 *
 * Append-only, one JSON object per line, so parallel workers cannot lose each
 * other's entries to a read-modify-write race — which a JSON array would.
 */
export function witness(testTitle: string, marker: string): void {
  mkdirSync(dirname(SINK), { recursive: true });
  appendFileSync(SINK, `${JSON.stringify({ test: testTitle, marker })}\n`);
}

/** Every (test, marker) pair executed in this run. */
export function readSink(): Set<string> {
  try {
    return new Set(
      readFileSync(SINK, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const entry = JSON.parse(line) as { test: string; marker: string };
          return key(entry.test, entry.marker);
        })
    );
  } catch {
    // No sink at all is not "nothing ran" — it is also what a run with no claims
    // project looks like. `global-teardown` decides what that means; this only
    // reports what is there.
    return new Set();
  }
}
