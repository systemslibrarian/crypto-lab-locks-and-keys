/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * IT IS EMPTY, AND IT WAS EMPTY ON THE FIRST FULL DRIVE. That is a weaker claim
 * than it sounds, and the honest version matters: an empty baseline is also what
 * an oracle that never ran produces, and thirteen repos in this fleet certified
 * themselves clean exactly that way. So the oracle was PROVED live by degrading
 * the token it owns, rather than inferred from a green run:
 *
 *   `--control-border` was changed from #626d7a to #2b3440 — the value of the
 *   decorative `--border` divider — the build was confirmed to SUCCEED, the
 *   built CSS hash was confirmed to MOVE (5a91dd0f -> 071462bf), and the gate
 *   then failed naming the controls and their ratios: `textarea#message` and
 *   `button#tamper-msg.btn` at 1.37:1 and `button.btn.btn-quiet.copy-btn` at
 *   1.27:1, each "border-top N:1 vs surround", against a required 3:1. On
 *   restore the hash returned to 5a91dd0f.
 *
 * So the file is empty because `src/style.css` was authored against the rule, not
 * because nothing looked. Every operable control takes `--control-border`; the
 * `--border` token measures about 1.4:1 against the card it divides and is used
 * for dividers only. `.btn-primary` draws its edge in `--accent-ink` rather than
 * in its own accent fill, because a border the same colour as the fill it
 * surrounds is not a boundary at all — that is the single commonest 1.4.11 defect
 * in this fleet and the one shape this page would otherwise have had.
 *
 * The shared top bar's `.cl-btn`, baselined in older labs at ~1.49:1, already
 * draws its edge from `--cl-ink` here and clears 3:1 — which is why the two
 * entries most of this fleet carries are absent too.
 *
 * A run with `NT_BASELINE_CAPTURE=1` set prints every finding through this same
 * path and asserts nothing, which is how this file is regenerated; the capture
 * run printed zero lines.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
