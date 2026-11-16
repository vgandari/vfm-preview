import type { ReactNode } from "react";
import { parseFrontmatter, renderMarkdown, type Affiliation } from "@vfm/pipeline";

function affiliationText(a: Affiliation): string {
  const place = [a.city, a.region, a.country].filter(Boolean).join(", ");
  return [a.department, a.name, place].filter(Boolean).join(", ");
}

export default function Frontmatter({ text }: { text: string }) {
  let parsed;
  try {
    parsed = parseFrontmatter(text);
  } catch (err) {
    return <pre className="vfm-error">{(err as Error).message}</pre>;
  }
  const { meta, data } = parsed;
  if (Object.keys(data).length === 0) return null;

  // Number affiliations in order of first appearance across authors.
  const affiliations: Affiliation[] = [];
  const numberOf = (a: Affiliation) => {
    let i = affiliations.findIndex((x) => x === a || (x.name === a.name && x.department === a.department));
    if (i < 0) i = affiliations.push(a) - 1;
    return i + 1;
  };
  const authors = meta.authors.map((a) => ({ author: a, nums: a.affiliations.map(numberOf) }));

  let abstract: ReactNode = null;
  if (meta.abstract) {
    try {
      abstract = renderMarkdown(meta.abstract, { numberingDepth: 0, headingShift: 0, id: null });
    } catch {
      abstract = <p>{meta.abstract}</p>;
    }
  }

  return (
    <header className="vfm-frontmatter">
      {meta.title && <h1>{meta.title}</h1>}
      {meta.subtitle && <p className="vfm-subtitle">{meta.subtitle}</p>}

      {authors.length > 0 && (
        <div className="vfm-authors">
          <p>
            {authors.map(({ author, nums }, i) => (
              <span key={i} className="vfm-author">
                {author.url ? <a href={author.url}>{author.name}</a> : author.name}
                {nums.length > 0 && <sup>{nums.join(",")}</sup>}
                {author.corresponding && <sup title="Corresponding author">*</sup>}
                {i < authors.length - 1 && ", "}
              </span>
            ))}
          </p>
          {affiliations.length > 0 && (
            <ol className="vfm-affiliations">
              {affiliations.map((a, i) => (
                <li key={i}>{a.url ? <a href={a.url}>{affiliationText(a)}</a> : affiliationText(a)}</li>
              ))}
            </ol>
          )}
          {authors.some(({ author }) => author.email || author.orcid) && (
            <p className="vfm-author-contact">
              {authors
                .filter(({ author }) => author.email || author.orcid)
                .map(({ author }, i) => (
                  <span key={i}>
                    {author.name}
                    {author.email && <> · <a href={`mailto:${author.email}`}>{author.email}</a></>}
                    {author.orcid && <> · <a href={`https://orcid.org/${author.orcid}`}>ORCID {author.orcid}</a></>}
                  </span>
                ))}
            </p>
          )}
        </div>
      )}

      {meta.date && <p className="vfm-date">{meta.date}</p>}

      {abstract && (
        <section className="vfm-abstract">
          <h2>Abstract</h2>
          {abstract}
        </section>
      )}

    </header>
  );
}
