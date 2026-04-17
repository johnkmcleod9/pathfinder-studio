# Pathfinder Studio — Session Instructions for Claude

## Project at a glance

TypeScript library + CLI that compiles `.pathfinder` source archives
(project.json + manifest.json + media/) to published courses for
SCORM 1.2, SCORM 2004, xAPI (TinCan), or standalone HTML5. In-browser
runtime ships a broad interaction surface (text, button, image, video,
audio, shape, quiz with 7 question types, triggers, conditions, layers,
variables, resume/suspend, keyboard nav, ARIA regions).

**Mission:** provide an authoring + runtime stack that lets Pathwise
(and eventually open-source contributors) break out of the Articulate
Storyline / Rise ecosystem without losing interoperability — with
courses beautiful enough that learners notice, and an authoring
experience good enough that authors prefer it.

## Working style

- **Red/green TDD is the law.** See `CONTRIBUTING.md`.
- **Two test surfaces:** vitest (unit + integration, `npm test`) and
  Playwright (e2e + visual regression, `npm run test:e2e`). Both
  stay green on every PR.
- **Build before running the CLI-oriented tests:** `dist-package.test.ts`
  needs `npm run build` first (enforced in CI).
- **Commits are small, single-purpose, and honest.** No "misc tweaks."

## Design Context

This repo uses the **Impeccable** design skill. The full Design
Context lives in [`.impeccable.md`](./.impeccable.md). The
condensed version for quick context is below — **always read
`.impeccable.md` before doing any design work**.

### Personality
**Crisp · Editorial · Grown-up.** Magazine-quality composition.
Treats the learner as an intelligent professional. No confetti,
no "Great job!", no cartoon mascots.

### Aesthetic direction
Lineage of Craft · Bear · Ghost, pulled toward editorial precision.
Warm paper surfaces with a tobacco / burnt sienna brand hue
(`oklch(0.48 0.11 45)`). Serif for reading content, sans for UI
chrome. Both themes (light + dark) ship from day one.

### Anti-references (non-negotiable — never resemble any of these)
- Articulate Storyline / Rise
- Generic corporate LMS (Cornerstone, Absorb, SAP SuccessFactors)
- AI-dashboard aesthetic (cyan-on-dark, purple gradients, glow)
- Cartoony e-learning for adults

### The five governing principles
1. Editorial clarity over template uniformity.
2. Warm materiality over flat neutrality.
3. Serif for reading, sans for interface.
4. Respect the professional learner.
5. Motion is meaning, not decoration.

### The AI slop test
*"If you showed this interface to someone and said 'AI made this,'
would they believe you immediately?"* If yes, the work isn't done.
A distinctive interface makes someone ask "how was this made?",
not "which AI made this?"

### Banned fonts (training-data reflex defaults)
Reject any of: Inter, Fraunces, Newsreader, Lora, Crimson (+Pro/Text),
Playfair Display, Cormorant (+Garamond), Syne, IBM Plex family, Space
{Mono, Grotesk}, DM {Sans, Serif Display, Serif Text}, Outfit, Plus
Jakarta Sans, Instrument {Sans, Serif}. The full list + rationale
lives in `.impeccable.md`.

## Audience (brief — full version in .impeccable.md)

Two audiences: (1) Pathwise internal authors (+ future OSS contribs);
(2) adult professional learners in Canadian government, healthcare,
and corporate training contexts. Both deserve to be treated as
intelligent peers.
