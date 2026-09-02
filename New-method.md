# Codex Task: Add a NEW subtitle translation method — "Skeleton STR"

You are working inside an **existing subtitle-translation application**.  
Your job is to add **one new translation method** next to the methods that already exist.

## Absolute constraints (do not violate)

1. **Do not modify, refactor, rename, delete, or "improve" any existing translation method.**  
   Existing methods must keep the same IDs, UI labels, prompts, request shapes, parsers, and output behavior.
2. **Do not change the default selected method.** The new method is opt-in.
3. **Do not rewrite the app's architecture.** Plug into the current method-registry / strategy pattern.
4. **If you must share a helper**, extract it only if it is currently duplicated AND existing methods keep calling the same public API with identical results. Prefer **copying the new pipeline into its own module** over touching old code.
5. **If a file is the method switch / enum / settings UI**, you may add **one new option**. That is the only allowed edit to shared files.
6. If you are unsure whether a change would affect an old method: **do not make it**. Put the logic in the new method's own files.

---

## What to add

### Identity

| Field | Value |
|---|---|
| Internal ID | `skeleton_str` |
| UI label (EN) | `Skeleton STR` |
| UI label (FA, if the app is bilingual) | `اسکلت‌محور STR` |
| Tooltip / short help | `Strip structure → context-batch translate dialogue only → restore original skeleton. Timecodes never leave the client.` |
| Where it appears | The same method/engine dropdown as the existing options, **appended at the end** |

This method is a reverse-engineered production pipeline (inspired by rockbenben/subtitle-translator). It is **not** "translate the whole SRT as one blob" and **not** "send each cue independently with no alignment contract".

---

## The strategy you must implement (this is the spec)

The method is a **three-phase pipeline**:

```
SOURCE FILE
    │
    ▼
┌─────────────────────────────────────────┐
│ PHASE 1 — SKELETON SPLIT                │
│ Parse format. Extract dialogue only.    │
│ Keep a parallel skeleton + index map.   │
│ Protect ASS tags with placeholders.     │
└─────────────────────────────────────────┘
    │  contentLines[]  +  contentIndices[]  +  originalLines[]
    ▼
┌─────────────────────────────────────────┐
│ PHASE 2 — DIALOGUE TRANSLATION          │
│ LLM: numbered-marker context batches    │
│ MT fallback: chunked join/split         │
│ Failures: soft-fill with ORIGINAL text  │
└─────────────────────────────────────────┘
    │  translatedLines[]  (same length as contentLines)
    ▼
┌─────────────────────────────────────────┐
│ PHASE 3 — SKELETON RESTORE              │
│ Restore ASS tags. Write text back at    │
│ contentIndices. Never re-parse the      │
│ translated file for structure.          │
└─────────────────────────────────────────┘
    │
    ▼
OUTPUT FILE (same format, same timing, same cue count)
```

### Invariants (load-bearing — tests must lock these)

**I1. The model never sees structure.**  
Timecodes, cue numbers, `WEBVTT` headers, `NOTE`/`STYLE`/`REGION` blocks, VTT cue IDs, HLS `X-TIMESTAMP-MAP`, LRC `[ar]/[ti]/…` metadata, and ASS `Dialogue:` prefix fields (Layer, Start, End, Style, Name, Margins, Effect) are **stripped locally** and **never sent**.

**I2. Alignment is by index, never by re-parsing.**  
`translatedLines[i]` always belongs to `contentLines[i]`, which always belongs to physical source line `contentIndices[i]`. After translation you **write back into a copy of the original lines array**. You do **not** parse the LLM output as SRT/ASS/VTT to recover timing.

**I3. Slot count is sacred.**  
`len(translatedLines) == len(contentLines)` always. Never drop a slot. An empty translation **falls back to the original dialogue** (`orElseSource`). Deleting an empty slot desynchronizes every later cue.

**I4. Empty translation must not become a cue separator.**  
In SRT/VTT a blank line is a cue boundary. Writing an empty translated line splits the cue and shifts the rest of the file. Fallback to original instead.

**I5. If numbered markers cannot be parsed, do NOT guess by line position.**  
A positional split silently mis-times subtitles whenever the model reorders lines or changes the line count. Return empty slots and retry / soft-fill. **A line left untranslated at the CORRECT timestamp beats a translation at the wrong one.**

**I6. Soft-filled (failed) slots are original text.**  
Post-processing (character stripping, glossary, punctuation cleanup) must **skip** those indices. Otherwise you produce text that is neither source nor translation, while the UI claims "failed lines kept original".

**I7. Do not treat "translation == source" as failure.**  
Proper nouns, numbers, `OK`, `♪`, Tokyo, etc. legitimately translate to themselves. The only "keep original / skip bilingual duplicate" signal is the engine's **soft-fill index set**, not string equality.

---

## PHASE 1 — Skeleton split

### 1.1 Format detection (content voting, not extension-only)

Inspect the first ~50 non-empty lines. Vote:

- `WEBVTT` on the first non-empty line → `vtt` immediately.
- `Dialogue: <layer>,<start>,<end>,` and/or `[Script Info]` → `ass` **only if** ass votes **strictly greater than** every other format (tie must NOT become ASS — teaching SRTs that mention "Dialogue:" would be hijacked).
- `HH:MM:SS,mmm --> HH:MM:SS,mmm` → `srt`
- `HH:MM:SS.mmm --> …` without WEBVTT header → treat as **srt** (dot-SRT community variant). True VTT requires the header.
- LRC `[mm:ss.xx]` **only if** the file has **zero** `-->` arrows and zero SBV timecodes (otherwise lyrics-inside-SRT would be misread as LRC).
- YouTube SBV: `H:MM:SS.mmm,H:MM:SS.mmm` (comma, no arrow), after SRT/VTT.

Timecode regex (SRT/VTT), tolerate tabs/multiple spaces around `-->`, optional hours, 1–3 fractional digits:

```
^(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}[ \t]+-->[ \t]+(?:\d+:)?\d{2}:\d{2}[,.]\d{1,3}
```

SBV:

```
^\d+:\d{2}:\d{2}\.\d{1,3},\d+:\d{2}:\d{2}\.\d{1,3}$
```

LRC time: `^\[\d{2}:\d{2}(\.\d{2,3})?\]`

If undetectable → error, do not send garbage to the model.

### 1.2 `filterSubLines(lines, fileType)` → `{ contentLines, contentIndices, assContentStartIndex }`

Walk every physical line. Push a line into `contentLines` iff it is **dialogue**. Record its physical index in `contentIndices`.

**SRT**

- Start extracting at the first timecode.
- Skip: integer cue numbers (pure `/^\d+$/` AND next line is a timecode AND (prev is blank/file-start OR number == lastSeq+1)). The `lastSeq+1` clause is required for **compact SRT** (no blank line between cues) so `#2`, `#3`, … are not sent as dialogue. A spoken number that is NOT `lastSeq+1` stays as content.
- Skip timecodes.
- Everything else non-empty after extraction starts is content.

**VTT** (same as SRT plus)

- Skip `WEBVTT` header and `X-TIMESTAMP-MAP`.
- Skip `NOTE` / `STYLE` / `REGION` blocks: they start only at a **block boundary** (file start or previous line blank) and run until the next blank line. If a timecode appears before a blank, **stop skipping** (malformed files). Cue text that happens to start with `"NOTE "` is NOT a block.
- Skip cue identifiers: the single non-empty line immediately above a timecode whose line-before-that is blank (or file start).
- Strip YouTube inline tags before sending: `</?c\b[^>]*>` and karaoke timestamps `<H:MM:SS.mmm>`. Use the class-bearing form; a bare `<c>` regex leaves orphan tags.

**SBV**

- After first SBV timecode: non-empty, non-timecode lines are content (including numeric dialogue).

**LRC**

- Strip all `[mm:ss.xx]` tags and karaoke `<mm:ss.xx>` tags.
- If anything remains, it is content. Pure timestamp lines (instrumental anchors) are NOT content.
- Do **not** apply SRT's "integer line is a cue number" filter — LRC has no cue numbers; lyrics like `"3"` or `"1999"` must be translated.

**ASS/SSA**

- Find `[Events]` then `Format:` to learn how many comma-separated fields exist. `assContentStartIndex = formatFieldCount - 1` (the `Text` column). Default `9` if no Format line.
- If no Format line: sample up to 100 `Dialogue:` lines and take `min(commaCount)`.
- Match `Dialogue:` **case-insensitively**.
- Content = `parts.slice(assContentStartIndex).join(",")` (re-join because dialogue itself may contain commas).
- Skip empty Text (timing/sign placeholders). Do **not** skip integer-only Text (`"3"`).

### 1.3 ASS tag protection — `prepareAssForTranslation` / `restoreAssAfterTranslation`

ASS overlay tags must not go to the model (they get corrupted). They also must survive.

**Before translate, per content line:**

1. If the line is vector-drawing mode (`{\p1}`…`{\p9}`): mark `verbatim = originalLine`, emit `cleanLine = ""` (do not send). Coordinates are not language.
2. Capture **leading** continuous `{…}` blocks (`^{…}+`). Store them. Strip from the sendable text.
3. Replace each **segment break** with a numbered placeholder. A segment break is `\N` or `\n` plus any `{…}` tags **immediately before and after it**:

   ```
   (?:\{[^}]*\})*\\[Nn](?:\{[^}]*\})*
   ```

   Placeholder format: `###0###`, `###1###`, … (exactly three hashes each side, numeric id).  
   **Do not use `#+\d+#+` on restore** — adjacent slots produce `###1######2###` and a greedy `#+` swallows the middle.

4. Strip remaining **inline** `{…}` tags **without restoring them**. Protecting mid-sentence italics (`the {\i1}second{\i0} door` → `the ###0###second###1### door`) causes the model to leave the trapped word untranslated. Losing an italic is acceptable; leaking a source word is not.
5. If after placeholder substitution the line has **no real letters** (only placeholders/whitespace): treat as verbatim, do not send.

**After translate, per line:**

1. If verbatim: return the original line unchanged.
2. Convert real newlines in the translation back to `\N`.
3. Restore placeholders: first exact `###n###`, then a loose `#{1,3} ?(\d+) ?#{1,3}` for models that insert spaces. Unknown / already-consumed ids → delete the token (never leak `###0###` onto screen).
4. Prepend stored leading tags.

**Why `###n###`:** literal `\N` is eaten by some MT engines (`NEngland`); PUA codepoints get stripped to bare digits. `###n###` round-trips on zh/ja/ar/fr.

---

## PHASE 2 — Dialogue translation

Implement **two engines** behind `skeleton_str`. Choose by the already-configured provider:

- If the provider is an **LLM** (OpenAI-compatible, Claude, Gemini, DeepSeek, local Ollama, …) AND there is more than one content line → **context-marker batching** (this is the signature of Skeleton STR).
- Else (DeepL / Google / Azure / GTX / …) → **chunked MT** path.

Do not invent a third "send the whole file" path.

### 2.1 Context-marker batching (LLM) — THE CORE

Defaults (overridable in the new method's own settings, not global ones):

| Knob | Default | Meaning |
|---|---|---|
| `contextWindow` | `20` | target lines per LLM request |
| `contextBatchSize` | `3` (cloud) / `1` (local Ollama) | parallel batches |
| `MAX_CONTEXT_PADDING` | `50` | cap on neighbor padding |
| padding | `min(50, max(1, floor(contextWindow/2)))` | `[CONTEXT]` lines before/after the batch |
| `delayTime` | existing app default, else 200ms | pause between batches |

**Pre-fill**

- Blank / whitespace-only / invisible-unicode-only lines (`U+200B ZWSP`, `U+200C`, `U+200D`, `U+2060`, `U+FEFF`) are **not translation targets**. Pre-fill them with themselves. `String.trim()` does **not** remove these; if you miss them, every batch containing a ZWSP cue is "incomplete" forever.
- Slot state: `undefined` = not done; any string (including `""`) = done. Write-once: never overwrite a decided slot.

**Build the wire payload for batch `[batchStart, batchEnd)`**

```
contextStart = max(0, batchStart - padding)
contextEnd   = min(n, batchEnd + padding)
```

For each line in `[contextStart, contextEnd)`:

- If it is a **target** (inside the batch):  
  `[TRANSLATE_k]{line}[/TRANSLATE_k]` where `k` is **0-based inside the batch** (`k = index - targetStart`).
- Else:  
  `[CONTEXT]{line}[/CONTEXT]`

Join with `\n`.

**System prompt (fixed for this method, do not reuse other methods' prompts):**

```
You are a professional subtitle translator. Respond only with the tagged lines. Do not add explanations, comments, markdown fences, or any extra text.
```

**User prompt template (inject around the existing ${content} substitution, last):**

```
Context: This is part of a subtitle file. Only translate the lines marked with [TRANSLATE_X][/TRANSLATE_X] tags (where X is the line number). Use the [CONTEXT][/CONTEXT] lines for understanding but do not translate them. Maintain the natural flow of dialogue and keep the same numbering in your response.

CRITICAL REQUIREMENTS:
1. You MUST translate ALL {batchSize} lines marked with [TRANSLATE_X] tags
2. Do NOT skip any numbers from 0 to {batchSize-1}
3. Keep the exact format: [TRANSLATE_X]translation[/TRANSLATE_X] (X = the line number)
4. NEVER merge lines: when one sentence spans several marked lines, translate each line's fragment separately under its own number — do NOT combine multiple lines' content into a single tag; a tag may be empty ONLY if its source line is empty
5. If a line contains only sounds/exclamations, still translate them appropriately

{content}
```

In the **format example inside the prompt, never use a real digit**. Write `[TRANSLATE_X]…[/TRANSLATE_X]`. A model that echoes `[TRANSLATE_0]translation[/TRANSLATE_0]` would win slot 0 under first-wins and ship the literal word "translation" onto cue 0, cached as success.

Substitute template variables (`${targetLanguage}`, etc.) **before** inserting `{content}`. Insert content with a function-form replacement so `$`, `$'`, `` $` ``, `$&` inside subtitle text are not interpreted.

**Extraction — `extractTranslatedLinesWithNumbers(response, expectedCount, sourceLines, contextLines)`**

Regex (single pass, backreference locks open/close numbers):

```
\[TRANSLATE_(\d+)\]([\s\S]*?)\[\/(?:TRANSLATE|TRANSLTranslate)_\1\]
```

(`TRANSLTranslate` is a real tokenizer glitch some models emit. Match it.)

Also strip leftover tags: `\[\/?(TRANSLATE(_\d+)?|TRANSLTranslate_\d+|CONTEXT)\]`

Then apply these guards **in this order**:

1. **Bucket by captured N.** Out-of-range ids dropped. First-wins per slot.
2. **1-based overflow fail-safe.** If `expectedCount > 1` AND a tag numbered exactly `expectedCount` exists AND slot 0 is empty → the model numbered `1..N` instead of `0..N-1`. **Reject the whole response** (return all empty). Trusting it would shift EVERY cue against its timestamp, flagged as success, then cached.
3. **Merge guard.** If slot `i` is empty AND its source was non-blank, discard the nearest previous **non-blank-source** slot that currently looks successful. Gemini routinely stuffs a whole sentence into the first fragment's tag and omits the rest. Keeping the merge while retrying the omitted lines **duplicates** the sentence. Walk back across blank-source slots (ASS tag-only lines can sit mid-sentence).
4. **Echo guard (AFTER merge guard).** If a slot's text equals a **different** line in `contextLines` (the full window the model saw, including forward `[CONTEXT]`), it is an untranslated copy. Nuke to `""`. Equality with **its own** source is legitimate (names, numbers). Do not run this before the merge guard — an isolated echo would become a "gap" and the merge guard would also discard the innocent predecessor.
5. **No positional fallback.** If no markers parsed, return empties.

**Adjacent-duplicate trigger (not a deleter)**

If two **adjacent** non-empty translations are **exactly equal** after trim, AND their sources are both non-blank AND **different**, the model merged and then filled both tags with the same sentence. Do **not** delete by heuristic. Re-translate **each involved slot as an independent single-line request** (merge is physically impossible in a single-line call). Legitimate same-translation (`Yeah.` / `Yes.` → both `آره`) comes back the same; the cost of a false positive is extra requests, never lost content. Flatten newlines in the rescue to a space.

**Retry ladder (do not skip rungs)**

1. Main pass: batches of `contextWindow`, concurrency `contextBatchSize`.
2. If a batch has gaps: **halve the window** (floor, min 5), retry only the **gap clusters**, not the whole batch. Already-successful slots are write-once.
3. Cluster construction: contiguous failed indices, **bridging across blank-source lines**, max cluster size 10. Without bridging, `{k, k+2}` around a stripped ASS tag-only line retries as two isolated singles and the merge guard is inert.
4. After all batches: if any slot still empty, wait 1.5s (or 10s if this run hit HTTP 429), then cluster-retry with a small window (6, i.e. ±3 context).
5. Circuit breaker: 3 consecutive clusters that fill **zero** new slots → stop retrying (provider is down). Do not grind a 1000-line file for 20 extra minutes.
6. **Final soft-fill:** remaining `undefined` slots ← original `contentLines[i]`. Record them in `failures[]` with `{ index: i, line: contentIndices[i]+1, text: original }`. Skip recording if original is blank.

**Cache (optional, if the app already has a cache)**

- Key by `(sourceText, method, model, langs, prompt, glossary)`.
- On a **partially failed batch**, **delete the batch-level cache entry** so retries don't replay the bad response forever.
- Also cache **per-line successes** so a re-run only pays for still-missing lines.
- Empty-string cache hits are MISS (treat as uncached).

### 2.2 Chunked MT path (non-LLM)

Used when the selected backend is classic MT.

1. Drop blank content lines from the wire (they pass through by index). **Do not encode blanks as extra delimiters** — that double-writes the delimiter and shifts every later line.
2. Flatten inner newlines to spaces (a line that becomes two lines desynchronizes join/split).
3. Join non-blank lines with `\n` (or `<>` if the backend is DeepLX). If using `<>`, replace literal `<>` in source with `< >` first.
4. Split into chunks of ~5000 characters on the delimiter (`splitTextIntoChunks` — never cut inside a line).
5. Translate each chunk. Split the result on `\n`. Trailing extra empty line from the service: pop it, **and write the popped version back** (otherwise the next chunk shifts by one).
6. **If `produced.length !== sentLineCount` for THIS chunk:** do not discard the whole file. **Line-by-line rescue** that chunk only, serial + delay. Purge the bad chunk cache. Flatten newlines in rescues.
7. **If the request itself failed after retries:** keep the **whole chunk** as original (the service is down; line-by-line rescue would amplify a doomed call). Record every line of that chunk as failure.
8. Reassemble: `out = copy(contentLines); out[sourceIdx[k]] = translated[k]`. Empty produced slots → original + failure.

---

## PHASE 3 — Skeleton restore

### 3.1 Write-back

```
outputLines = copy(originalLines)
for i, phys in enumerate(contentIndices):
    text = translatedLines[i]
    if text.strip() == "":
        outputLines[phys] = originalLines[phys]   # I3/I4
        continue
    outputLines[phys] = inject(fileType, originalLines[phys], text, assContentStartIndex)
join, preserving original newlines style if you can detect it (\n vs \r\n)
```

**inject by format**

- **SRT/VTT/SBV (translated-only):** replace the physical content line with `text`. Timecode, cue number, blank separators, headers stay as they were.
- **ASS (translated-only):**  
  `prefix = originalLine.split(",", assContentStartIndex) joined back + comma`  
  `output = prefix + restoredTranslatedText`
- **LRC (translated-only):** keep every `[mm:ss.xx]` prefix (there may be several on one karaoke line), replace the lyric tail.

### 3.2 Bilingual (if the app already has a bilingual toggle, honor it for this method too; if not, skip)

Never emit `original + empty translation` — that inserts a blank line and splits SRT cues.

- SRT/VTT/SBV: group content lines **by the physical index of the preceding timecode line** (NOT by the timecode string — two independent cues can share identical timestamps). Inside a cue, join all originals then all translations (not interleaved orig/trans/orig/trans). Soft-filled cues output original only.
- ASS in-place: `Dialogue…original\Ntranslation` (strip leading `{tags}` from the second half so they don't duplicate). Verbatim drawing lines: output once, never bilingual-duplicate (the copy after `{\p0}` would render as garbage text).
- LRC: `[mm:ss.xx] original / translation`

### 3.3 Do not re-parse translated text to discover cues

Especially forbidden: "write translations into a VTT string, then run VTT→SRT by scanning for timecode-shaped lines". If a cue's **dialogue** itself looks like a timecode, you split the cue, drop a translation, and renumber everything after it. Cue boundaries are already known from `contentIndices` + `findTimeLineIndexBefore`.

---

## Integration rules for THIS codebase

1. Find how current methods are registered (enum, map, strategy class, settings dropdown).
2. Add `skeleton_str` as a **new entry** at the end of that list.
3. Create new files, e.g.:
   - `…/methods/skeleton_str/split.py` (or `.ts`) — detect + filterSubLines + ASS protect
   - `…/methods/skeleton_str/translate.py` — context batch + chunk MT
   - `…/methods/skeleton_str/restore.py` — assembleSubtitleOutput
   - `…/methods/skeleton_str/method.py` — façade implementing the existing Translator interface
4. Wire the façade into the registry **and nowhere else**.
5. Reuse the app's existing HTTP/LLM client, API keys, language list, and file I/O. Do not fork a second client stack.
6. If the app translates via a single `translate(text) -> text` function, the new method must still call that function **per batch / per line**. Do not bypass billing, retries, or user-selected models.
7. Keep the method's settings local: `contextWindow`, `contextBatchSize`, `useContext` (default **on**). Do not change global retry/timeout defaults used by other methods.

### UI copy to add (only)

- Dropdown option: `Skeleton STR`
- One help line under it:  
  `Extracts dialogue, translates with numbered context batches, writes text back into the original timecodes. Existing methods are unchanged.`
- Optional advanced knobs (collapsed): Context window, batch concurrency, bilingual.

---

## Tests you must add (new files only)

Do **not** alter existing tests. Add a new test module.

Minimum cases:

1. **SRT round-trip timing:** every output cue has the exact original timestamp and cue index; only text differs.
2. **Compact SRT** (no blank lines between cues): cue numbers are not translated.
3. **Spoken number** `"3"` as dialogue is translated (or at least sent), not treated as a cue number.
4. **VTT** `NOTE`/`STYLE` blocks skipped; a dialogue line starting with `NOTE ` is kept.
5. **VTT cue id** is not sent; bilingual grouping does not steal it into the previous cue.
6. **ASS** `{\an8}` leading tag stripped before send, restored after. `\N` round-trips via `###n###`. Drawing `{\p1}` line unchanged and not sent.
7. **Empty translation fallback:** if the model returns an empty tag, that cue keeps original text; subsequent cues do not shift.
8. **Marker extraction 1-based overflow:** response tagged 1..N with empty slot 0 → all empty (retry), not a shifted file.
9. **Merge guard:** first tag contains lines 0+1, tag 1 empty → slot 0 discarded too (cluster retry), not duplicated output.
10. **Echo guard:** a TRANSLATE slot that copies a CONTEXT neighbor is emptied.
11. **Adjacent duplicate:** two equal translations from different sources → single-line retranslate, not deletion.
12. **Soft-fill skip:** character-removal post-process does not mutate failed slots.
13. **Chunk MT mismatch:** one chunk returns wrong line count → only that chunk is rescued; other chunks kept.
14. **LRC** multiple time tags on one line preserved; instrumental `[mm:ss]` with no lyric not sent.
15. **Detection tie:** an SRT whose dialogue mentions `Dialogue:` is still SRT, not ASS.

Use tiny fixture files (5–15 cues). Do not network in unit tests: mock the LLM to return controlled tagged strings.

---

## Done means

- [ ] New method `skeleton_str` appears **next to** old methods, not instead of them.
- [ ] Default method is unchanged.
- [ ] Old methods' code, prompts, and tests are byte-identical except for the registry/dropdown append.
- [ ] Translating a sample `.srt` / `.ass` / `.vtt` with the new method keeps every timestamp identical (`diff` on timecode lines is empty).
- [ ] Cue count in / cue count out.
- [ ] Failed lines remain original language at the correct timestamp.
- [ ] New unit tests pass.
- [ ] Existing test suite still passes with **zero** modifications.

If the current app's interface is `translate_file(path, method) -> path`, implement:

```
if method == "skeleton_str":
    return SkeletonSTRTranslator().translate_file(path, ...)
```

and leave every other branch untouched.
