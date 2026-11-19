# Chrome Web Store listing

Everything the Chrome Web Store developer dashboard asks for, in order. Upload `extension/tells-extension-<version>.zip` (built by `node build/build_extension.mjs`).

## Store listing

- **Name:** Tells: spot machine-made writing
- **Summary (132 characters max):** Underlines the phrases that make writing read AI-made as you type, with what to write instead. Runs on your device; sends nothing.
- **Category:** Productivity → Tools
- **Language:** English
- **Description:**

> Tells underlines the phrases and sentence shapes that make writing read machine-made, right in the box you're typing in: Gmail, LinkedIn, X, or any text box on the web. Click the count in the corner to see each one, what it signals, and what to write instead.
>
> It's a lens, not a lie detector. A mark means a sentence reads the way model output often reads. It doesn't prove who wrote it. On held-out samples Tells marks 44% of machine-written messages and 6% of human emails written before ChatGPT, so use it to edit your own drafts, not to judge other people's.
>
> - Works as you type, in any text box, without changing the page
> - Right-click selected text and choose "Check with Tells"
> - Turn it off for any site from the toolbar button
> - 375 rules, each tested on human and machine-written text
> - Open source (MIT): https://github.com/SZoloth/tells
>
> Everything runs on your device. Tells makes no network requests and collects nothing.

- **Screenshots (1280×800):** `screenshot-1.png`, `screenshot-2.png`
- **Small promo tile (440×280):** `promo-tile-440x280.png`
- **Homepage URL:** https://szoloth.com/tells
- **Support URL:** https://github.com/SZoloth/tells/issues

## Privacy practices

- **Single purpose:** Mark phrases in the text a user is writing that commonly make prose read machine-made, and suggest what to write instead.
- **Permission justifications:**
  - `storage`: remembers the user's two settings (sites where Tells is off, and whether to show weaker tells).
  - `contextMenus`: adds "Check with Tells" to the right-click menu for selected text.
  - Host permission `<all_urls>` (content script): Tells reads the text box the user is typing in, on whatever site they write, to underline phrases there. The text never leaves the page.
- **Remote code:** No. All code ships in the package.
- **Data usage:** Collects no user data. Check none of the data types. Certify: not sold, not used for unrelated purposes, not used for creditworthiness.
- **Privacy policy URL:** https://github.com/SZoloth/tells#privacy
