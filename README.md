# Tells

Tells finds the phrases and sentence shapes that make prose read machine-made, and says what to write instead. It runs in the browser, in Node and in [Margin](https://github.com/SZoloth/margin), with no dependencies and nothing sent anywhere.

Try it at [szoloth.com/tells](https://szoloth.com/tells).

```sh
node bin/tells.mjs draft.md          # flagged tells, one per line
node bin/tells.mjs draft.md --hints  # also the weaker rules
cat email.txt | node bin/tells.mjs - --json
```

```js
import { compile, scan } from "./src/tells.js";
const engine = compile(rulesJson);   // rules/tells.json
const { matches } = scan(engine, text);
```

## Chrome extension

The extension underlines tells in the text box you're typing in, with a count in the corner that opens the notes. It runs on Gmail, LinkedIn and X; for any other site, click the toolbar button and choose "Turn on for this site", and Chrome asks you to allow that one site. Right-click selected text and choose "Check with Tells" to check anything on a page. The toolbar button also turns it off for a site. It needs no API key, because it calls no model.

To install it before it's on the Chrome Web Store:

1. Download `tells-extension-<version>.zip` from the [latest release](https://github.com/SZoloth/tells/releases/latest) and unzip it.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose the unzipped folder.

Build it yourself with `node build/build_extension.mjs`; the listing text and screenshots for the Web Store are in `extension/store/`.

## What it is and isn't

Tells marks candidates for a reader to judge. It doesn't decide who wrote a text. On held-out samples it flagged at least one tell in 44% of machine-written messages and 6% of human ones, so a clean result proves nothing and a single hit proves little. Use it to edit your own drafts, or to see why someone else's message reads the way it does. Don't use it to hide or reject messages. In a test on the maintainer's own inbox (95 cold messages over 90 days), a filter on how messages sound would have hidden one he chose to answer.

Tools like [Pangram](https://www.pangram.com/) answer a different question, "did a model write this?", with a trained classifier. Tells answers "which sentence gives it away, and what replaces it?"

## Where the rules come from

`rules/tells.json` holds 375 rules merged by `build/build_rules.py` from four sources:

- the [declauding](https://github.com/oaustegard/claude-skills) linter by Oskar Austegard (MIT): 160 sentence-shape and phrase rules
- Sam Zoloth's kill-word list and stock-phrase bans: 102 rules
- Sam's [Margin](https://github.com/SZoloth/margin) writing rules, kept only where the trigger is a short phrase: 101 rules
- Tells' own rules for classic openers, closers and word forms the others miss ("I hope this email finds you well", "empowers"): 12 rules

Typography rules (curly quotes, dash characters) are left out on purpose. Phones and Macs insert them, so they fire on people.

## How rules earn their tier

Each rule's tier comes from evidence, the way SpamAssassin's [mass-check](https://cwiki.apache.org/confluence/display/SPAMASSASSIN/MassCheck) scores spam rules. `eval/ruleqa.mjs` runs every rule over two corpora that stay on the maintainer's machine:

- **Human:** 600 emails written before ChatGPT launched (Nov 30, 2022), half by the maintainer and half by people he wrote back to. Every hit there is a false positive.
- **Machine:** 96 replies from four model families (GPT-6 Luna, Claude Sonnet 5.5, Claude Opus 5.5, GLM 5.3) to plain writing requests: cold emails, LinkedIn notes, cover letters, blog paragraphs, PR descriptions.

Tiers are set on half of each corpus and reported on the other half.

| Tier | Rule | Count |
| --- | --- | --- |
| `flag` | shown by default: rare in human mail and mostly found in machine text, or a hand-curated slop phrase with no hits either way | 223 |
| `hint` | shown with `--hints`: fires in more than 1% of human messages, or not clearly more often in machine text | 150 |
| `off` | fires in more than 8% of human messages ("let me know if", "very") | 2 |

Held-out results with the default tier:

| Tells found | Machine messages | Human messages |
| --- | --- | --- |
| 1 or more | 44% | 6% |
| 2 or more | 8% | 1% |

The four model families differ a lot. Tells found something in 9 of 12 GLM samples, 5 of 12 for each Claude model, and 2 of 12 for GPT-6 Luna. Newer models avoid the well-known tells, which is the main reason a tell list decays. A list that is published becomes a list for the next model to avoid.

A second check uses Margin's writing rules as labels. Of 30 "AI slop" rules with a sentence-length before and after, Tells flags 8 of the befores and 1 of the afters. On 88 voice and structure rules it shows no signal, as expected: those rules are about voice, not machine tells.

## Keeping it current

Rerun the pipeline when the sources change:

```sh
python3 build/build_rules.py    # merge the sources
node eval/ruleqa.mjs            # needs the local corpora in eval/corpus/
node eval/margin_pairs.mjs      # needs ~/.margin/margin.db
pnpm test
```

## Privacy

Tells runs entirely on your device. The scanner, the web page, the extension and the Margin lens make no network requests with your text and collect nothing. The extension stores two settings in Chrome's sync storage: the sites where it's off, and whether to show weaker tells.

## License

MIT. The declauding rules keep their MIT notice in `NOTICE`.
