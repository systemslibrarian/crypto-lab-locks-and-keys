# Locks and Keys

Public and private keys, shown rather than asserted. A real 2048-bit RSA key pair is
generated in your browser; a note is encrypted to the public half with **RSA-OAEP**, opened with
the private half, an unrelated key fails to open it — and then **the same pair does its other
job**, signing and verifying with **RSA-PSS**.

**Live demo:** <https://systemslibrarian.github.io/crypto-lab-locks-and-keys/>

---

## What It Is

A beginner's on-ramp to the single idea the rest of modern cryptography is built on: that you
can publish half of a key and keep the other half.

The exact primitives are **RSAES-OAEP** (RFC 8017 §7.1) with SHA-256 and MGF1-SHA-256, and
**RSASSA-PSS** (RFC 8017 §8.1) with SHA-256 and a 32-byte salt, both called through the
browser's own `crypto.subtle` on a 2048-bit modulus. There is no cryptographic library in this
repo and no hand-rolled arithmetic — the browser's implementation is the one under test.

**The problem it addresses.** Two people who have never met need to exchange something secret.
With a shared password, they first have to agree on the password, which is the problem again.
A public key breaks the loop: you hand out a padlock anyone can snap shut and keep the only key
that opens it.

**The security model.** Everything is per-session and in memory. No backend, no network calls,
no storage — the only thing this page writes to `localStorage` is the theme pin. Reloading the
page destroys the key pair.

**Not production crypto — a teaching demo.** One specific thing here is deliberately not what
a real system does: the private half is generated `extractable: true`, because Step 4 proves
the signing pair is the *same* pair by exporting the public half from two different key handles
and comparing the bytes. A real system marks a private key non-extractable and never exports
it. The page says so in its own words, not just here.

### What it does NOT prove

The lab declares one **negative claim**, and demonstrates it rather than disclaiming it:

> A note that opens does not tell you who sent it. RSA-OAEP decryption establishes nothing at
> all about the sender: anyone holding the public half can produce a block this private half
> opens, and the block carries no record of who made it.

Step 3's third button reaches a state where **every check the page performs reports success and
the property is violated anyway** — a stranger holding nothing but your public bytes writes a
message you never typed, and your own private half opens it perfectly. The verdict reads
`OPENED — AND UNATTRIBUTED`. There is no failure code to show, because there is no check there
that could fail: the encrypted block has no sender field in it. The absence of a code is the
exhibit. That state is also the reason Step 4 exists, and the page hands you straight to it.

Step 4 then draws the *second* boundary, in the state where a reader is most likely to over-read
a result: a verified signature says the signature matches this note under this public half, and
connecting that to a person needs the separate knowledge that the key is theirs. The page says
so beside the VERIFIED verdict, not in a footnote.

Two things the lab is also explicit about in-page:

- **This is not how most of the web works today.** The padlock story is *literally* true for
  RSA, which is why the lab uses it; the curve-based shape most systems use needs a throwaway
  key pair and a key-derivation step before anything is encrypted. Honest scoping, not an
  apology — a beginner lab that quietly implied RSA is what HTTPS uses would be teaching
  something false in order to be simple.
- **A four-byte fingerprint is not an authentication check.** It exists so Step 3 can show you
  a *different* pair and Step 4 can show you the *same* one, without putting key material on
  screen.

## Exhibits

1. **Step 1 — Make a pair.** One button, one real `crypto.subtle.generateKey` at 2048 bits. The
   public half is shown and copyable; the private half is described and never displayed
   anywhere on the page. A short fingerprint labels the pair so you can tell it from another.
2. **Step 2 — Encrypt a note to you.** Maya has your **public** half and nothing else. The
   result is one 256-byte block of nothing readable, and it is 256 bytes for any note short
   enough to fit — so the size of the block says nothing about the length of the note. Press it
   twice and both blocks stay on screen side by side: completely different bytes, same note,
   because a fresh random seed goes into every encryption. The panel states, beside the result,
   that the private half was not used and was not needed.
3. **Step 3 — Open it.** The private half returns your note character for character. Then a
   **second, freshly generated** pair tries the same bytes and fails — painted *calmly*, because
   a lock holding shut against the wrong key is the one thing a lock is for, not an error. Then
   the negative-claim fixture above.
4. **Step 4 — The same pair, a different job.** The panel first **proves** the pair is the one
   from Step 1, by exporting the public half from the encrypting handle and the verifying handle
   and comparing the bytes. Then the private half signs, the public half verifies, and the
   reader edits the note the checker is given — by hand, or with one button — and watches it
   refuse, with the changed character marked. The readable note sits beside its signature
   throughout, so "a signature does not hide the message" is shown rather than claimed. This is
   the panel that earns the lab its place: most newcomers believe signing is a separate
   mechanism with its own keys.
5. **How this demo checks its own results.** Twelve pinned cases run in your browser on
   arrival. Four of them are cases the construction is **required to refuse**, and the page
   prints that figure by counting the fixture rather than quoting it.
6. **A recap and three questions.** A table of which key does which job and what each result
   does *not* establish, then three scenario questions with no score attached. Short optional
   predictions sit before the Step 3 and Step 4 experiments, so a reader commits to an answer
   before the page shows them one.

### One pair, not two

WebCrypto binds a key to an algorithm: a key generated for `RSA-OAEP` cannot be handed to
`RSA-PSS`, and asking it to sign throws. A lab that reached for two `generateKey` calls would
make Step 4's whole claim false. So one pair is generated, the private half is exported as
PKCS#8 and the public half as SPKI, and both are re-imported under `RSA-PSS`. WebCrypto writes
the `rsaEncryption` algorithm identifier for both schemes, so the two SPKI exports are
byte-identical — and `makePair()` asserts that at the moment the pair is made rather than
trusting it, which means a future edit reaching for a second `generateKey` throws there instead
of letting the page go on claiming something untrue.

### "Different jobs", not "backwards"

An earlier version of this lab called Step 4 *the same pair, backwards*, and that phrasing was
the one genuinely misleading thing in it. It is gone from the page, the metadata and this file.

What is true is that one pair does both jobs and the halves swap roles: public encrypts /
private decrypts, then private signs / public verifies. What is **not** true is that signing is
encryption run backwards. RSAES-OAEP and RSASSA-PSS are different constructions with different
padding, and PSS verification does not decrypt a signature to recover a message — it rebuilds an
encoded block and checks its structure. "Running the pair backwards" describes the raw trapdoor,
not either scheme, and a beginner who takes it literally ends up believing a signature is a
secret in reverse. Other public-key families do not offer both jobs on one pair at all, and
production systems routinely keep signing and encryption keys separate.

The insight the brief was reaching for survives — newcomers really do believe signing is a
separate mechanism with its own keys — and the lab still proves the pair is the same one. Only
the false mechanism claim is gone, and a `claims` test asserts the page does not say
"backwards".

## When to Use It

- **Use it** as the first thing someone meets about public-key cryptography — it is step 2 of
  the catalog's "Start here" path, after *what a hash is*.
- **Use it** to settle the signing question. "One pair does both jobs" is a sentence people nod
  at and do not believe; Step 4 makes it a measurement by exporting the public half twice.
- **Do NOT use it** as a guide to building anything. Encrypting a message directly to someone's
  RSA public key is not how working systems do this — they encrypt a *key* to the public half
  and the message to that key, which is what **HPKE Envelope** shows. The 190-byte ceiling you
  hit in Step 2 is exactly why.
- **Do NOT use it** to choose a key size, a padding mode, or a curve. **Iron Letter** compares
  ECIES P-256 against RSA-OAEP directly and owns the trade-off.
- **Do NOT come here for the number theory.** It is deliberately absent: no modulus, no
  exponent, no `c = m^e mod n` anywhere on the page, and the words *prime*, *modulus* and
  *exponent* appear nowhere outside the link to **Educational RSA**, which exists to show
  exactly that layer.

## Live Demo

<https://systemslibrarian.github.io/crypto-lab-locks-and-keys/>

Press one button and work down the page. You can: generate a pair; lock a note to the public
half and watch the ciphertext change on every press; open it with the private half; generate an
unrelated pair and watch it fail; let a stranger use your public half and discover that a
message that opens proves nothing about who sent it; sign with the private half and check with
the public half alone; change one character and watch the check refuse; and read the twelve
pinned cases that ran before you arrived.

Every long value — the public key, the locked block, both key exports, the whole signature — is
behind a disclosure that ships shut, so the page reads in plain language and the bytes are one
click away.

## What Can Go Wrong

- **Handing out the wrong half.** The two halves are not interchangeable, and the page keeps them
  visually distinct throughout for that reason. Publishing a private key is unrecoverable: every
  message ever locked to its partner is open, including ones recorded years ago.
- **Believing a message that decrypts.** The failure this lab is built to prevent. Decryption is
  not authentication, and Step 3 proves it by letting a stranger exercise the gap.
- **Trusting a short fingerprint.** Four bytes is far too few to authenticate anything; the page
  says so where it prints one.
- **Assuming a signature covers intent.** A signature is over particular bytes. Step 4's tamper
  shows that the check cannot even tell you *which* side changed — only that the two no longer
  agree — and nothing in it identifies who did the changing. **Signed Bytes** is the lab about
  the gap between bytes and meaning.
- **Reaching the 190-byte ceiling and padding around it.** RSA encryption of long data by
  chopping it into blocks is a classic and serious mistake. The answer is hybrid encryption.
- **Deterministic padding.** Both schemes here are randomized on purpose — a fresh OAEP seed per
  block and a fresh PSS salt per signature. The unit suite asserts both, because a build in
  which either became deterministic would look completely normal on screen.

## Real-World Usage

RSA-OAEP and RSA-PSS are specified in RFC 8017 (PKCS #1 v2.2) and are both widely deployed —
RSA-PSS in TLS 1.3 certificate signatures, in modern code signing and in JOSE's `PS256`;
RSA-OAEP in key transport in CMS, PKCS#11 tokens, JOSE's `RSA-OAEP-256` and smartcards. What is
*not* common is the shape this lab demonstrates for teaching: encrypting application data
directly to a public key. Real protocols use the public key to establish a symmetric key and
encrypt the data with that, because the ceiling you meet in Step 2 is real and because the
symmetric operation is orders of magnitude faster.

Newer systems increasingly use curve-based constructions rather than RSA for the same jobs, and
post-quantum key establishment (ML-KEM) for key transport. The fleet covers all three.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-locks-and-keys.git
cd crypto-lab-locks-and-keys
npm install
npm run dev          # http://localhost:5173/crypto-lab-locks-and-keys/
```

```bash
npm test             # unit suite (Vitest)
npm run build        # tsc --noEmit, then the production build
npm run test:a11y    # the axe WCAG gate, at 1280 / 390 / 320 px
npm run test:claims  # what the page says, and what it declares it does not promise
npm run mutations    # re-run the mutation ledger (see below)
npm run fetch-vectors  # regenerate src/crypto/vectors.ts from Project Wycheproof
```

The browser suites run against the production build served by `vite preview`, so what passes is
what ships. The lab's Playwright port is **4721**, unique across the fleet and pinned in the
catalog's `tools/playwright-ports.json`.

## Build & Verify

**30 unit tests** (4 files) + **27 claims tests** + **3 accessibility drives**.

**Correctness, in two independent halves.** A freshly generated key pair has no published answer
to compare against, so:

- `src/crypto/pair.test.ts` asserts **round-trip** and **cross-pair rejection** over four
  generated pairs each. The second is the half with teeth: a round-trip passes in a build where
  encrypt and decrypt are both wrong in the same direction, and in a build where `open()` ignores
  its key argument entirely. Cross-pair rejection fails both. It also asserts that the right key
  still works *in the same run*, so a build that refuses everything cannot pass by refusing.
- `src/crypto/vectors.test.ts` runs **12 pinned cases from Project Wycheproof** — the only check
  in this repo that could disagree with the lab. Four are cases the construction must
  **refuse**, and `src/crypto/vectors.test.ts` asserts both kinds are present so a regeneration
  cannot quietly drop the half that bites.

**On the pinned vectors, and a correction to the build brief.** `brief.md` asks for "a pinned
RSA-OAEP / RSA-PSS vector from RFC 8017's test data". **RFC 8017 publishes no test data** — its
appendices are A (ASN.1 Syntax), B (Supporting Techniques), C (ASN.1 Module), D (Revision
History) and E (About PKCS), and there is no test-vector appendix. Citing it for vectors it does
not contain would be a false attribution, so the cases come from
[Project Wycheproof](https://github.com/C2SP/wycheproof)
(`rsa_oaep_2048_sha256_mgf1sha256_test.json`, `rsa_pss_2048_sha256_mgf1_32_test.json`) and RFC
8017 is cited only for the two schemes it really defines. Wycheproof's parameters are *exactly*
the panels' own — 2048-bit, SHA-256, MGF1-SHA-256, 32-byte salt — so a pinned case exercises the
code a reader just drove rather than a neighbouring configuration.
`scripts/fetch-vectors.mjs` regenerates the fixture and CI fails if the committed file differs
from its output, so the provenance is reproducible rather than asserted. A `claims` test asserts
the page names Wycheproof and does **not** attribute the numbers to RFC 8017.

Each half is checked in the direction that is actually pinnable: OAEP by **decrypting** a
published ciphertext and PSS by **verifying** a published signature. Both schemes are randomized,
so the encrypt and sign directions cannot be reproduced from a vector — only the deterministic
halves can, and those are the halves Steps 3 and 4 perform.

**The accessibility gate.** `@axe-core/playwright` scans the production build for zero WCAG 2.1
A/AA violations at **1280, 390 and 320 px**, and the Pages deploy is blocked if it fails. The
gate is copied from `crypto-lab-schnorr-forge` — verified clean on every known oracle defect,
including the per-side `paintedSides` fix that 129 of 131 `nontext.ts` files in the fleet still
lack — with the oracle engines byte-identical and every passage describing a page rewritten for
this one. It asserts more than `violations`: axe's `incomplete` bucket, an arithmetic
composite-aware contrast walk (needed because every surface carrying this lab's meaning is a
`color-mix()` fill axe refuses to resolve), the same walk over `aria-hidden` content with the
exemption lifted, non-text contrast ratcheted against a baseline, keyboard reachability of
scrollers, focusable-but-invisible elements, and reflow — which axe has no rule for at all.

It found two real defects, both fixed in `src/style.css` with the measurement recorded beside
them: the standard hero's `.cl-hero-why` adds its own padding to a `width: 100%` under
`content-box` (411px against a 390px viewport, in every state), and `.source-line` ran its two
underscore-joined upstream filenames to 321px inside a 260px box (351px against 320).

Both contrast oracles found nothing — which is also what an oracle that never ran produces, so
each was **proved live by degrading the token it owns**: `--control-border` to the decorative
`--border` value named three controls at 1.27–1.37:1, and `--held-text` named
`span.verdict-headline` at 2.65:1 over the composited `color-mix()` backdrop axe cannot resolve.
The build succeeded and the CSS hash moved in both, and returned to its pre-mutation value on
restore. The records are in `e2e/nontext-baseline.ts` and `e2e/contrast.ts`.

**The mutation ledger — proof the tests bite.** A green suite is not evidence until you have
watched it fail. `mutations/mutations.json` records five mutations as **concrete patches** — a
file, an anchor that must occur exactly once, and its replacement — and `npm run mutations`
applies them one at a time, enforcing all four kill rules: the owning test **passed unmutated in
the same run**; the patch **changed the file**; the run **served the mutated code** (the bundle
hash moved, *and* the red run is not a build or server failure); and a patch that does not
compile is **DOES NOT BUILD** and is never a kill.

`mutations/LEDGER.md` and `LEDGER.json` are written by the runner. **Every `observed` line in
them was written by the run that produced it, never typed.** All five are currently killed, and
the restored bundle hash matches the unmutated one.

| Mutation | Verdict | Outcome |
|---|---|---|
| decryption always returns the plaintext | `wrong-key` | KILLED |
| verification always accepts | `checked` | KILLED |
| the wrong-key path silently reuses the right key | `wrong-key` | KILLED |
| the negative-claim text is deleted | `unattributed` | KILLED |
| a check inside the negative-claim fixture is broken | `unattributed` | KILLED |

The last two are what §4.1d requires of any negative claim: delete the claim text and the
assertion that it is on screen must fail; break a check inside the fixture and the assertion
that everything is green must fail. A negative-claim test that survives both is decorative.

The ledger is **enforced, not archived**. Each claims test records the (test, marker) pair it
actually asserted, and `e2e/global-teardown.ts` fails any full claims run in which a recorded
kill names a pair that never executed — so a kill can only stay recorded while the assertion
that produced it still exists. That enforcement was itself verified by corrupting one ledger
entry and confirming the run failed with all 16 tests passing.

## Pending central assignment

Two values ship as marked placeholders because the catalog pins them centrally, and `brief.md`
defers both:

- **`--accent`** is the documented fleet fallback `#35d6bb` in `src/style.css`, commented as a
  placeholder. The shared top bar reads it.
- **The favicon emoji** is the lock from the template's own §3.4 example, in `index.html`.

Also owed to the catalog, and not done from here: the card, the category, the
`tools/playwright-ports.json` pin for port 4721, and the `tools/dispatch-census.json` row —
`dispatch-sync check` reports this lab as `UNPINNED-LAB` until that row exists.

## Related Demos

- [Educational RSA](https://systemslibrarian.github.io/crypto-lab-rsa-educational/) — the number
  theory this lab deliberately keeps off the screen. The right place to send anyone who asks
  "but how?"
- [Iron Letter](https://systemslibrarian.github.io/crypto-lab-iron-letter/) — ECIES P-256 against
  RSA-OAEP directly, and the key-size trade-off.
- [HPKE Envelope](https://systemslibrarian.github.io/crypto-lab-hpke-envelope/) — how public-key
  encryption is actually packaged today, and the answer to Step 2's 190-byte ceiling.
- [Ed25519 Forge](https://systemslibrarian.github.io/crypto-lab-ed25519-forge/) — signatures in
  their own right, once Step 4 has made the point.
- [Hash Zoo](https://systemslibrarian.github.io/crypto-lab-hash-zoo/) — step 1 of the "Start
  here" path, which this lab follows.

---

*One of the browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
