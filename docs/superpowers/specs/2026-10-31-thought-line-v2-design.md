# Thought-line v2: design

<!-- Design for rebuilding Thought-line (Argument Transit Map) as a local-first tool for Yousef and his AI agents. Written and approved 2026-10-31. -->

Status: approved by Yousef 2026-10-31. Written 2026-10-31 on QALAM from a brainstorm with Yousef.

## Why

v1 (August 2026) was built in one sitting with Gemini in AI Studio, for an ideation course that only asked for a deck.
Yousef shipped an implementation instead, then never used it. It shows its origin:
- a dead "live app" link, a placeholder clone URL, and a promised MIT licence with no LICENSE file;
- a server that would let anyone spend his Gemini key if redeployed;
- everything rented: Gemini, Firebase, Google Docs.

v2 is the version built to be **used**. In his words, he wants to run it on all his personal writings (on the PC) and on all
his site's posts, and he wants to see his AI agents use it too. It must be **local-first**, his household thesis: own the
memory and the tools, rent only the model, keep it swappable.

## Who uses it

1. **Yousef**, in a browser, on two very different kinds of writing:
   - personal pieces: reflective, image-led, Arabic and English (e.g. *Icarus and his Sun*, *Offering of the lotus*);
   - argumentative site posts (claims, evidence, caveats).
2. **Claude** (laptop and PC sessions), through an **MCP** server, on its own drafts and on site posts before they publish.
3. **His local agent on the PC** (a separate agent harness running under WSL), through the same MCP server.
4. **The public, after v2** (Yousef, 2026-10-31: "Public comes later. v2 is the local version for me and my agents;
   just leave room for the public one."). Later, anyone will run it with **their own API key** for any provider, never on
   Yousef's key. v2 builds none of this; it only avoids closing the door (see "Room for the public version").

## What it shows: two lenses, in two tabs

Every piece of writing opens in **two tabs** (Yousef chose "two tabs" over layered or side-by-side views):

- **Logic** keeps v1's transit-map idea: claims as stations, the support between them as lines, interchanges where lines
  share a claim, loops (circular reasoning), and dead ends (claims nothing builds on, or conclusions with no support).
- **Thought** is the path the writing takes through its images and motifs, in order: e.g. sun, wings, fall, cage, moons,
  star. It shows where the path returns to an image, branches, or stops.

He asked for "both" when asked whether Icarus should show its logic or its thought path. Both tabs come from the same
analysis of the same text.

## Features in v2 (his picks, in suggested build order)

| # | Feature | What it means |
|---|---|---|
| core | **One piece, two tabs** | Paste, open or speak a text and get its Logic and Thought maps. |
| 3 | **Where certainty jumps** | Each support link in Logic carries a confidence. The map flags any step that becomes more sure than its input allows: his speed-limit rule (a step may raise confidence by at most +0.15). |
| 4 | **Readers in the margin** | Through MCP, Claude and his local agent can open a map and leave notes pinned to stations ("this leans on nothing", "this image carries the claim"). The notes show in the UI with their author. This replaces v1's AI "council" personas with real readers. |
| 2 | **Then and now** | Compare two versions of a piece: what was dropped, added, strengthened or weakened, on both tabs. This replaces v1's "past-self debate" with real drafts. |
| 1 | **Threads across the library** | A view over many pieces at once: the images and motifs that recur across a whole collection (e.g. moon and tides, sun, wonder recur across his personal writings). The literal "thought line". |
| 5 | **Speak it in** | Dictate into a piece through rawi (his local Arabic and English dictation app). The map updates as text arrives. |

Suggested order (builder's call within this): core, then 3, then 4, then 2, then 1, then 5.

## Non-goals (for now)

- **Google Docs export, Firebase and accounts.** Nothing rented, no sign-in.
- **A dedicated bilingual network view** (Arabic and English as two lines of one map). Not picked. Arabic text must
  still display and analyse correctly (see constraints); only the special view is out.
- **Export to the site's "Build it" ladder.** Not picked now; could come later.
- **v1's persona council and past-self debate as AI role-play.** Replaced by features 4 and 2.

## Anti-goals (it fails if...)

- Any of his **personal writings leave the house**. His personal pieces live on the PC and are private.
  The tool itself sends a private piece nowhere but the local model on his machines. The readers he chose (Claude on
  either machine, his local agent) may read private pieces through MCP: "private" means
  private to the house, not to one machine. Nobody and nothing else gets them: no cloud key, no public build, no repo.
- It runs on **Yousef's key for strangers**. Public use is bring-your-own-key only. No server holds his key.
- Maps **look certain when the text isn't**. Confidences and flags must be honest; a dead end is shown as a dead end.
- It is a pretty demo nobody uses again. The test is whether he and the agents actually run it on real writing.

## Constraints

- **Local model by default.** An OpenAI-compatible endpoint (LM Studio or llama.cpp's server) on the **PC**:
  RTX 4070, 12 GB VRAM, 16 GB RAM. The laptop (QALAM, no GPU) and the agents reach it on the home network or Tailscale.
  Which model is the builder's call within that budget, chosen by measured quality on real samples.
- **MCP server** for Claude and the local agent: tools to analyse a text, fetch a map, add a margin note, compare versions, and
  query threads. It must be runnable on the PC so the local agent (WSL) and the laptop's Claude can both reach it.
- **Arabic and English:** right-to-left text renders correctly in stations and notes; mixed pieces are not broken apart
  or transliterated.
- **Privacy of storage:** maps, notes and libraries are stored locally (files or a local database). Nothing syncs to a
  cloud.
- **Public repo hygiene** (it is a public GitHub repo): a real LICENSE (MIT, as v1 promised), no keys or personal writing
  committed, and a README that says plainly what v2 is: a local tool that needs your own local model (or a key, for
  public pieces), with steps that work.

## Room for the public version

v2 does not build the public version, but it must not make it hard to add later:
- **The model sits behind one small interface** (send text, get the structured analysis back), with the local
  OpenAI-compatible endpoint as the first provider. A cloud provider with the user's own key is just another provider.
- **The analysis code does not depend on Node-only features**, so the same code could later run in a browser.
- **Storage sits behind one interface too**, so a later browser build can swap the PC's local store for browser storage.
- Not decided for later: which features the public version gets, and how it copes with providers that block calls made
  straight from a browser.

## Decided by Yousef

- v2 is local-first; the local model runs on the PC's GPU.
- v2 is the local version for him and his agents. The public version (bring your own key, any provider) comes after,
  and v2 leaves room for it.
- Agents connect through MCP.
- Two lenses, Logic and Thought, shown as two tabs.
- Features 1 to 5 above are in; bilingual network view and site export are out.
- Rebuild rather than patch.

## Calls made by Claude (check these)

- **Same repo, not delete:** tag the current code `v1-aistudio`, build v2 on a branch, make it `main` when ready. This
  keeps the URL that his site already links to. (Discussed with him; he agreed to rebuild, not to a specific git route.)
- **Stack:** stay with what v1 uses: TypeScript, React and Vite for the UI; a small local Node service for analysis and
  storage; the MCP server in TypeScript.
- **One analysis, two lenses:** a single structured analysis (stations, links, confidences, motifs, order) feeds both
  tabs, so the tabs never contradict each other.
- **Private by default.** Every piece carries a `private` or `public` label, and new pieces start `private`. A private
  piece only ever goes to the local model. A public piece (e.g. a published site post) may also use a cloud key if one is
  set. The provider layer, the MCP server and Threads (which mixes pieces) all check the label; the default is the safe one.
- **One home, on the PC.** A single Node service on ECHO-POINT holds storage, analysis and the MCP server. The laptop's
  browser, the laptop's Claude and the local agent reach it over **Tailscale only** (not the open LAN), with a token, because it
  serves private text. If the PC is off,
  the tool is off: no laptop copy, no sync. MCP over HTTP is the main path; the builder checks what transport the local agent
  supports and adds stdio if needed.
- **Versions are explicit saves.** "Then and now" compares two saved versions of a piece (a save in the app, or a
  re-import of a changed file). Each version's map is a frozen snapshot. Margin notes anchor to a **passage of text**
  (quote plus position), not to a station ID, so they survive re-analysis and carry to a new version when the passage
  still exists, and show as "passage gone" when it does not. Live dictation updates a working draft; it becomes a version
  only when saved.
- **What the +0.15 rule measures:** the writer's expressed certainty against the support the text itself gives. A root
  claim's support comes from what backs it in the text (evidence or a source cited, an example, or bare assertion, from
  low to high risk). A claim resting on several supports is capped by the weakest one it needs. Any claim stated more
  surely than its support plus 0.15 is flagged as a jump. This is rhetorical overreach, not the model's own opinion of
  the idea. Same spirit as his pipeline's calibration rule, adapted to prose.
- **Threads cross languages.** A motif has one language-neutral identity, so "moon" in English and القمر in Arabic are one
  thread. He moves between the two languages within a single piece; splitting the library by language would cut his
  threads in half.
- **Import:** bulk import from a folder (Markdown, text, Word, HTML), with a re-scan on demand. Site posts are imported
  from the site's own repo (`writing/<slug>/index.html`), not fetched from the live site. Where his personal writings sit
  on the PC is confirmed at build time.
- **Speak it in needs no rawi code.** rawi is system-wide dictation that pastes into whatever field has focus. So
  feature 5 is the editor re-analysing live as text arrives, throttled to what the 12 GB GPU can keep up with.
- **Judging quality:** the builder (a Claude, which may read his private pieces) tests candidate models on a handful of
  real pieces, mixed personal and site. Yousef marks those maps right or wrong, light-touch, like Yousefbench. His marks
  are the pass bar, not the builder's own score.

## Left to the builder

The exact schema of the analysis, prompting and model choice, layout algorithm for the transit and thought maps, storage
format, MCP tool names and shapes, and test strategy.
