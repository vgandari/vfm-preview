# Language-Specific Refinements for Paragraphs

A companion to **How Your Paragraphs Become Slides** (`how-paragraphs-become-slides.md`). Read that guide first. Everything in it works in any language. This guide covers the extra refinements that depend on the language you write in.

---

## The short version

Some improvements need to know the words or grammar of a particular language, for example which words mean "however" or "for example." These refinements are added one language at a time. If your language has them, paragraphs come out a little cleaner. If it doesn't, nothing breaks: the tool simply uses the general rules from the main guide.

The same promises still hold. The tool only picks and trims your own words, never adds any, and bold sentences keep their large scoring bonus and their bold formatting.

---

## Do I have these refinements?

Which languages have which refinements depends on how your tool has been set up, and a language may have some of them but not others. If you aren't sure about yours, ask whoever maintains the tool. You can also tell by comparing your slides against the examples below.

If a refinement is missing for your language, the paragraph is handled by the general rules instead.

---

## The refinements at a glance

| Refinement | What it does | Without it |
|---|---|---|
| Abbreviation awareness | Doesn't mistake "Dr." or "e.g." for the end of a sentence | A sentence might be split in the wrong place |
| Lead-in words | Recognizes openers like "However," and "Moreover," and removes them from bullets | Openers stay in, and don't affect which sentences are picked |
| Ordinal steps | Recognizes "first, second, third" as the steps of a process | Only sentences that start with numbers are seen as steps |
| List phrases | Recognizes "includes" and "such as" as introducing a list | Only lists introduced by a colon are recognized |
| Contrast words | Recognizes "but," "whereas," "while," and similar words, and shows both sides in two columns | The sentence is treated as regular text |
| Sentence context check | When a picked sentence opens with a word like "This" or "It," also includes the sentence before it | A picked sentence may appear without the sentence it refers to |
| Grammar-based trimming | Removes grammatical asides and trailing clauses more precisely | Only brackets and comma or dash asides are removed |

---

## Refinements, with examples

All examples sit inside an `@slide` ... `@end` block, and single line breaks are treated as spaces.

### Abbreviation awareness

Languages with abbreviations that end in a period can confuse sentence splitting. With this refinement, common abbreviations are known.

```
@slide
The study was led by Dr. Chen at the university. Results were published in
2021. A follow-up is planned.
@end
```

**On the slide**

- The study was led by Dr. Chen at the university.
- A follow-up is planned.

**Why?** "Dr." is recognized as an abbreviation, so the first sentence stays whole. Without this refinement, the sentence could be cut after "Dr." and the bullet would end there.

### Lead-in words

Words such as "however," "moreover," and "in addition" connect a sentence to the one before it, and they read oddly on their own on a slide.

```
@slide
Revenue grew. Moreover, repeat purchases rose 18% after the launch.
@end
```

**On the slide**

- Revenue grew.
- Repeat purchases rose 18% after the launch.

**Why?** The lead-in "Moreover," was removed, since it only makes sense with a sentence before it. Sentences that open this way are also slightly less likely to be picked in the first place. A bold sentence still keeps its large bonus, which easily outweighs this small penalty.

### Ordinal steps

Without this refinement, a process is recognized only when each sentence begins with a number. With it, ordinal words are recognized too.

```
@slide
First, export the data from the old system. Second, clean up duplicate
records. Third, import the file into the new system.
@end
```

**On the slide**

1. Export the data from the old system.
2. Clean up duplicate records.
3. Import the file into the new system.

**Why?** Sentences that begin with ordinals such as "first, second, third" are recognized as steps, so they become a numbered list. The ordinal words are dropped because the list is numbered automatically.

### List phrases

Without this refinement, a list is recognized only when a colon introduces it. With it, phrases such as "include" and "such as" work too.

```
@slide
Supported formats include PDF, HTML, PowerPoint, and plain text.
@end
```

**On the slide**

- PDF
- HTML
- PowerPoint
- plain text

**Why?** "Include" followed by three or more short items is recognized as a list, so each item becomes its own bullet, just as if you had used a colon.

### Contrast words

Sentences that set two things against each other can be shown side by side.

```
@slide
Acquisition costs are rising, whereas retention costs are flat.
@end
```

**On the slide**

A two-column layout, with the acquisition side in one column and the retention side in the other.

**Why?** "Whereas" signals a contrast. Without this refinement, the sentence would be handled as regular text and appear as a single bullet.

### Sentence context check

A sentence that starts with a word like "This," "It," or "They" points back to something in the sentence before it. On a slide, without that earlier sentence, readers are left asking "this what?" With this refinement, the tool knows which opening words do this in your language.

```
@slide
Retention improved sharply this year. The loyalty program launched in March.
It lifted repeat purchases by 18%.
@end
```

**On the slide**

- Retention improved sharply this year.
- The loyalty program launched in March.
- It lifted repeat purchases by 18%.

**Why?** The first and last sentences would normally be the two picked. The last one begins with "It," and the sentence before it wasn't picked, so that earlier sentence is brought in as well. This can make a slide hold more than two sentences from a paragraph.

**A hint about your writing.** This check is a safety net, not a fix. When a picked sentence leans on the one before it, the slide gets longer, and it can still read awkwardly. If you see this happen often, the better remedy is to rewrite the sentence so it makes sense on its own, for example "The loyalty program lifted repeat purchases by 18%." The sentence then works in any language, with or without this refinement.

**When it does nothing.** If the earlier sentence is already being shown, or the sentence is the first in its paragraph, there is nothing to add.

### Grammar-based trimming

For languages where the tool understands sentence structure, it can remove parts of a sentence that the general rules can't recognize, such as an explanatory clause tacked on at the end.

```
@slide
The team redesigned the onboarding emails, which had been unchanged for years.
@end
```

**On the slide**

- The team redesigned the onboarding emails.

**Why?** The trailing clause was identified as extra explanation and removed. As with all trimming, only deletions are made, and bold text is never removed.

**Safety net.** If trimming would leave something that is no longer a complete sentence, the tool falls back to the general tidying from the main guide, which only removes brackets and comma or dash asides.

---

## How to get the best results in any language

| If you want... | Do this |
|---|---|
| Control that doesn't depend on language support | **Bold** the one or two sentences you want. Bold scoring works the same in every language |
| Lists to be recognized everywhere | Use a colon followed by short items, which works in any language |
| Contrasts to show clearly | Write the two sides as two short sentences, or bold the one you want favored |
| Clean steps in a process | Start each step's sentence with a number or an ordinal word |
| Slides that read well whichever sentences are picked | Write each sentence so it makes sense on its own, rather than starting with "This" or "It" |

---

## Questions you may have

**Why do some of my slides look different from the examples?**
Your language may not have that refinement. The general rules from the main guide still apply.

**Do these refinements ever add words?**
No. They only recognize special words and remove text. Nothing is rewritten.

**Can a refinement override my bold text?**
No. Bold text is never removed, and a sentence containing bold text keeps its large scoring bonus, however much of it is bold.

**What if I write in more than one language in the same document?**
The tool uses one language for the whole document, not a different one for each paragraph. If the wrong language is being used, set it explicitly in your document's front matter.