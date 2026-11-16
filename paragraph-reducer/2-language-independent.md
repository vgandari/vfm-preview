# How Your Paragraphs Become Slides

A plain-language guide to what happens to the paragraphs in your `@slide` blocks when slides are created.

Some languages get extra refinements on top of what is described here. Those are covered separately in **Language-Specific Refinements for Paragraphs** (`language-specific-paragraph-features.md`).

---

## The short version

Slides need short text, but paragraphs are long. The tool does **not** rewrite or summarize your writing. It only **picks** the most useful sentences from each paragraph and **tidies** them. It never adds words of its own. A sentence containing **bold** text gets a big boost in the picking, and its bold formatting is kept on the slide. Sentences that aren't picked simply don't appear on the slide. If you want them in the speaker notes, add them with `@notes`.

---

## Where these rules apply

These rules apply **only to paragraphs inside an `@slide` ... `@end` block**.

- **In document mode**, the whole file is read as a normal document.
- **In slides mode**, everything outside `@slide` / `@end` blocks is ignored and does not appear on any slide. The tool still reads the whole file first, though, and that matters for how sentences are scored (see Step 5).

---

## What you can count on

- **Your words only.** Slide text always comes from your paragraph, never from anywhere else.
- **Bold counts, and stays bold.** A sentence containing any bold text gets a large scoring bonus, and its bold formatting is preserved on the slide.
- **Your source is untouched.** The tool never changes your file. It only decides what shows on the slide.
- **Works in any language.** The steps below do not depend on the language you write in. Some languages get extra refinements, described in the language-specific guide.
- **Fits automatically.** `@slide` blocks split content across slides to fit, so you don't need to worry about length.
- **When unsure, it plays safe.** If the tool can't find a good short version, it leaves the paragraph off the slide rather than putting a clumsy bullet on it.

---

## What happens to each paragraph

### Step 1: Notice your bold text

Any sentence that contains **bold text** earns a large scoring bonus in Step 5. It makes no difference how much of the sentence is bold: one bold word counts the same as a fully bold sentence. The bonus is as big as the one for being the first sentence of the paragraph.

A bold sentence is very likely to be picked, but it is not guaranteed. Other sentences can still outscore it, and if you bold many sentences in one paragraph, they compete with each other.

Whenever a bold sentence is picked, its bold formatting is kept on the slide. Bold text is also never removed by the tidying in Step 6.

There are no settings to choose between. The process below is always what runs.

### Step 2: Clean up the text

The paragraph is read as plain text. A single line break inside a paragraph is treated like a space, not as a new line, so it doesn't matter how you wrap your text in the file. A blank line is what starts a new paragraph. The tool also remembers which words you made **bold**, so that formatting can be kept on the slide.

### Step 3: Split into sentences

The paragraph is divided into individual sentences using standard rules for how sentences end in each writing system.

### Step 4: Work out what kind of paragraph it is

The tool looks for tell-tale shapes, using punctuation and formatting rather than vocabulary:

| If the paragraph looks like this... | It is treated as... | It appears on the slide as... |
|---|---|---|
| A sentence with a colon followed by three or more short items | A **list** | Separate bullets, one per item |
| Built around a number with a %, currency symbol or unit | A **statistic** | A big highlighted number with a short caption |
| Sentences that each begin with a number (in some languages, also ordinal words such as "first" and "second"; see the language-specific guide) | A **process** | A numbered list of steps |
| Anything else | **Regular text** | One or two bullets |

Definitions are not guessed from paragraph text. To present a definition, use the **definition** environment provided by the markdown flavor, which is part of its theorem environments.

### Step 5: Pick the most important sentences

Each sentence earns points for being likely to matter:

- It contains **bold text**, even a single bold word. This is a large bonus, as big as being the first sentence.
- It is the **first** sentence (usually the main point) or, to a lesser degree, the **last**.
- It shares **uncommon words with the section heading or the slide title** (if you gave the `@slide` block a title), so it is clearly on topic.
- It contains a **number**.
- It is less likely to be a throwaway opener, one that begins with a word that starts lots of sentences.

What counts as "uncommon" or "starts lots of sentences" is measured across your **whole document**, including the text outside `@slide` blocks, before that outside text is ignored in slides mode. This means the scoring is the same whether you build the document or the slides.

The one or two highest-scoring sentences are kept, in their original order.

**Long paragraphs.** A paragraph of roughly six sentences or more is first divided where the topic seems to change. Each part is handled separately, so a long paragraph can produce more than one group of bullets.

### Step 6: Tidy the chosen sentences

Only deletions, never additions:

- Text in **brackets or parentheses** is removed.
- Asides set off between **pairs of commas or dashes** are removed.
- Bold text is never removed.

### Step 7: Place it on the slide

The result is dropped into the layout that matches the paragraph type (bullets, big number, or numbered steps). Bold formatting is kept. If there is more than will fit, the `@slide` block continues onto further slides on its own.

---

## Examples

All examples sit inside an `@slide` ... `@end` block. Paragraphs are shown wrapped across several lines; those single line breaks are treated as spaces, so each is still one paragraph.

### Example 1: Regular text with a bold sentence

```
@slide
Retention improved sharply this year. **Repeat purchases rose 18%** after the
loyalty program launched (see the appendix for methodology). The team also
redesigned the onboarding emails, which had been unchanged for years. Support
tickets were flat.
@end
```

**On the slide**

- Retention improved sharply this year.
- **Repeat purchases rose 18%** after the loyalty program launched.

**Why these two sentences?** The second sentence contains bold text and a number, so it scores highest, and its bold formatting stays. The first sentence is the opening sentence, which earns the next-highest score. The bracketed note was removed. The other two sentences scored lower and don't appear on the slide. To put them in the speaker notes, add them with `@notes`.

### Example 2: A list

```
@slide
The platform supports several export formats: PDF, HTML, PowerPoint, and
plain text.
@end
```

**On the slide**

- PDF
- HTML
- PowerPoint
- plain text

**Why?** A colon followed by three or more short items is recognized as a list, so each item becomes its own bullet.

### Example 3: A statistic

```
@slide
Customer churn fell to 4.2% in the third quarter after the pricing change.
@end
```

**On the slide**

A large highlighted **4.2%**, with a short caption taken from the sentence, such as "Customer churn fell in the third quarter."

**Why?** The paragraph is built around a number with a % sign, so it becomes a big-number layout instead of a bullet.

### Example 4: Asides are removed

```
@slide
The pilot, which ran in three regions over six months, exceeded its targets
(see Table 2).
@end
```

**On the slide**

- The pilot exceeded its targets.

**Why?** The aside between the pair of commas and the text in brackets were both removed. Nothing was added.

### Example 5: A long paragraph

```
@slide
Our first office opened in 2009 with four employees. Growth was slow at first.
By 2014 we had moved to a larger building. Hiring accelerated after that
move. The second half of this document turns to our product roadmap. The
roadmap is organized around three themes. Each theme has a named owner who
reports quarterly.
@end
```

**On the slide**

Two short groups of bullets, one drawn from the company-history sentences and one from the roadmap sentences, because the topic changes partway through.

**Why?** The paragraph is long enough to be split where the subject shifts, and each part is handled on its own. If the result isn't what you want, split your paragraph into two paragraphs yourself.

### Example 6: A bold sentence on its own

```
@slide
**Our priority this year is retention, not acquisition.**

Acquisition costs have risen steadily. Retention has become the cheaper way to
grow.
@end
```

**On the slide**

- **Our priority this year is retention, not acquisition.**
- Acquisition costs have risen steadily.
- Retention has become the cheaper way to grow.

**Why?** The first paragraph is a single sentence that is both bold and first, so it is kept with its bold formatting. The second paragraph has no bold, so its first and last sentences score highest and are kept.

### Example 7: Bold sentences score highest

```
@slide
Renewals grew **12% in the north**. Costs were flat. **Churn dropped in every
region**. Staff satisfaction improved.
@end
```

**On the slide**

- Renewals grew **12% in the north**.
- **Churn dropped in every region**.

**Why?** Both sentences with bold text score highest. The first also gets points for being first and for containing a number. The other two sentences score lower and are not shown. Only the bold parts keep their bold formatting, even though the whole sentence counted as bold for scoring.

---

## How to get the result you want

| If you want... | Do this |
|---|---|
| A sentence to be very likely to appear on the slide | **Bold** any part of it, even one word. The bonus is the same however much is bold, and the bold formatting is preserved |
| Tight control over slide text | Bold only the one or two sentences you want. If you bold more, they compete with each other |
| A bold sentence without extra emphasis on the slide | Bold just one word in it. The whole sentence still gets the bonus |
| Better matching to your topic | Give the `@slide` block a title that uses the same key words as your paragraph |
| Cleaner automatic results | Lead each paragraph with its main point, and keep one idea per paragraph |
| Lists to come out as separate bullets | Introduce them with a colon and separate items with commas or semicolons |
| A definition on the slide | Use the definition environment, not a bold term in a paragraph |
| Extra detail for the presenter | Put it in `@notes` |
| A new paragraph | Leave a blank line. A single line break does not start one |

---

## Questions you may have

**Will it change my wording?**
No. It only chooses and trims. It never rephrases.

**Where did the rest of my paragraph go?**
It stays in your source file but is not shown on the slide. Use `@notes` to add it to the speaker notes.

**Why did a paragraph produce no bullets?**
The tool wasn't confident it could make a clean short version, so it left the paragraph off the slide. Bolding a key sentence gives it a large boost and will usually fix this.

**Why is a whole sentence on my slide when I only bolded one word?**
The sentence is scored as bold if any part of it is, and the whole sentence is picked, not just the bold word. Only the bold part keeps its bold formatting.

**Why isn't my bold sentence on the slide?**
Bold gives a large bonus but no guarantee. Only the one or two highest-scoring sentences are kept, so if you bolded several sentences in a paragraph, the others lost out to higher scores, such as the first sentence or one containing a number.

**Why is a paragraph outside my slide block missing?**
In slides mode, anything outside `@slide` / `@end` is ignored. Move it inside a block.

**Why does a bullet sound a little choppy?**
Picking and trimming sentences can't match a human editor. For anything important, bold the sentences you want, or move the paragraph's key point to its opening sentence.

**Does it matter what language I write in?**
No. The steps above work the same in any language. Some languages also get extra refinements, which are described in the language-specific guide.