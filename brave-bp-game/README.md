# Brave Code Review Dojo

A browser game for learning the 618 rules in the
[brave-core best practices](https://github.com/brave/brave-core/tree/master/docs/best-practices)
by reviewing code. Every rule has at least one scenario question (663 in total).

## Playing

Open `index.html` directly, or serve the repo locally:

```sh
./serve.sh            # from the repo root, then open /brave-bp-game/
```

The page is static with no build step, so it also works on GitHub Pages as-is.
Progress is saved in your browser's `localStorage`.

## How it helps you remember

- **Spaced repetition.** Each rule moves through five levels. A rule you miss
  comes back in 10 minutes; one you know comes back after 1, 3, 7, then 21
  days. Daily Review shows what's due plus a few new rules, and a 🔥 counter
  tracks your daily streak.
- **Applying, not reciting.** Questions put you in a code review ("you're
  reviewing this snippet, what do you say?"). Spot the Bug shows the docs' own
  wrong and correct code side by side, with the ❌/✅ labels removed so they
  don't give the answer away.
- **Feedback after every answer.** You see why the answer is right, the rule's
  title and summary, and a link to that exact rule in brave-core.

## Modes

- **Daily Review:** the spaced-repetition mix of scenario questions and code pairs.
- **Spot the Bug:** 375 wrong/correct code pairs taken from the docs.
- **Lightning Round:** 60 seconds, with combos for streaks of correct answers
  and a 5-second penalty per miss.
- **Recall Cards:** see a rule's title, explain it to yourself, then grade your
  own answer.
- **Rulebook:** search every rule and see your progress on each.

## Tracks

Each doc is a track. Click a track on the home page to practice just that area:
the track page shows your progress (mastered, learning, not started, due) and
offers every mode above limited to that doc, with its own Lightning Round best
score.

The checkbox on each track card controls whether that doc is included in the
mixed modes on the home page (for example, only C++ or only iOS). There's XP
and levels from "Intern" up to "Lion of brave-core".

Keyboard: `1`–`4` to answer, `Enter` for next, `Space` to reveal a card, `Esc`
to go back (to the track, then home).

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `app.js`, `style.css` | The game |
| `data/rules.json`, `data/rules.js` | Rules extracted from the docs |
| `data/questions/*.json` | Hand-written questions, one file per doc |
| `data/questions.js` | Bundled questions loaded by the game |
| `tools/` | Extraction, validation and bias-check scripts |

## Refreshing when the docs change

1. Get the docs, for example with a sparse clone:

   ```sh
   git clone --depth 1 --filter=blob:none --sparse https://github.com/brave/brave-core.git /tmp/bc
   git -C /tmp/bc sparse-checkout set docs/best-practices
   ```

2. Re-extract the rules:

   ```sh
   python3 tools/extract_rules.py /tmp/bc/docs/best-practices
   ```

3. Validate and bundle the questions. This lists any rules that don't have a
   question yet:

   ```sh
   python3 tools/build_questions.py
   ```

4. Check that answer length doesn't give away the correct choice. Aim for the
   correct answer being the longest in at most about 30% of questions per doc:

   ```sh
   python3 tools/check_bias.py [doc ...]
   ```

Rule IDs come from the `<a id="...">` anchors in the docs, so progress carries
over between refreshes. `localization.md` has no anchors, so its rules get
generated IDs (`LOC-001`, …) based on heading order.

## Question format

Each file in `data/questions/` is a JSON array of:

```json
{
  "rule": "CSM-005",
  "prompt": "Scenario in Markdown, optionally with a fenced code block",
  "choices": ["...", "...", "...", "..."],
  "answer": 2,
  "explain": "Why the answer is right, stated as the standard"
}
```

`answer` is the 0-based index of the correct choice. The game shuffles choices
when it shows them.

## Known doc issue

`architecture.md` opens a code block with four backticks and never closes it
before the next rule. On GitHub this hides the rules after it inside a code
block, and `documentation.md` has the same kind of problem. The extractor
closes any open code block when it reaches a new rule's anchor, but the fence
is worth fixing upstream.
