import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | The Bell",
  description: "Sources, authorship, privacy, and context for The Bell visualisation.",
};

const sources = [
  {
    name: "UN Women & UNODC",
    detail: "Femicides in 2023: Global Estimates of Intimate Partner/Family Member Femicides",
    href: "https://www.unwomen.org/en/digital-library/publications/2024/11/femicides-in-2023-global-estimates-of-intimate-partner-family-member-femicides",
  },
  {
    name: "World Health Organization",
    detail: "Violence Against Women Prevalence Estimates, 2018",
    href: "https://www.who.int/publications/i/item/9789240022256",
  },
  {
    name: "UNICEF",
    detail: "Global estimates of sexual violence against children, 2024",
    href: "https://www.unicef.org/press-releases/over-370-million-girls-and-women-globally-subjected-rape-or-sexual-assault-children",
  },
  {
    name: "UNICEF",
    detail: "Female Genital Mutilation: A Global Concern, 2024",
    href: "https://www.unicef.org/press-releases/over-230-million-girls-and-women-alive-today-have-been-subjected-female-genital",
  },
];

const charities = [
  {
    name: "UN Trust Fund to End Violence against Women",
    detail: "Funds specialist, often grassroots, initiatives addressing violence against women and girls.",
    href: "https://www.unwomen.org/en/trust-funds/un-trust-fund-to-end-violence-against-women/donate",
  },
  {
    name: "Equality Now",
    detail: "Uses law and policy reform to confront sexual violence, exploitation, and FGM.",
    href: "https://equalitynow.org/get-involved/donate-to-equality-now/",
  },
  {
    name: "Global Fund for Women",
    detail: "Moves funding to women-led and feminist movements working against violence and oppression.",
    href: "https://www.globalfundforwomen.org/donate-now/",
  },
  {
    name: "Women’s Aid",
    detail: "Supports domestic-abuse services and women escaping life-threatening relationships.",
    href: "https://www.womensaid.org.uk/get-involved/give/",
  },
  {
    name: "Orchid Project",
    detail: "Works with communities and advocates globally to end FGM/C.",
    href: "https://www.orchidproject.org/get-involved/donate/",
  },
];

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} rel="external noreferrer" referrerPolicy="no-referrer">
      {children}
    </a>
  );
}

export default function AboutPage() {
  return (
    <main className="about-page">
      <article className="about-panel">
        <header className="about-panel__header">
          <div>
            <p className="about-panel__eyebrow">The Bell</p>
            <h1>About</h1>
          </div>
          <Link className="about-panel__back" href="/">
            Back to the visualisation
          </Link>
        </header>

        <section className="about-section about-section--lead">
          <h2>What is it?</h2>
          <p>
            The Bell translates estimated worldwide rates of violence against women into
            ripples and bells. Five statistical streams run independently; each event type
            has its own rate, shape, colour, and sound.
          </p>
          <p>
            It is not a live incident counter, and a ripple does not claim to document a
            known individual case. The work turns otherwise abstract numbers into something
            perceptible—as density, interruption, and duration.
          </p>
        </section>

        <section className="about-section">
          <h2>Sources</h2>
          <p>
            The current estimates are derived from published global data by the following
            institutions. The calculation method, assumptions, and uncertainty ranges will
            be documented separately.
          </p>
          <ul className="about-links">
            {sources.map((source) => (
              <li key={`${source.name}-${source.detail}`}>
                <ExternalLink href={source.href}>{source.name}</ExternalLink>
                <span>{source.detail}</span>
              </li>
            ))}
            <li id="whitepaper">
              <a className="is-placeholder" href="#whitepaper" aria-label="Whitepaper, forthcoming">
                Whitepaper
              </a>
              <span>Methodology and calculations — forthcoming</span>
            </li>
          </ul>
        </section>

        <section className="about-section">
          <h2>Authors</h2>
          <dl className="about-credits">
            <div>
              <dt>Concept, research direction &amp; art direction</dt>
              <dd>Nina</dd>
            </div>
            <div>
              <dt>Design &amp; implementation</dt>
              <dd>Nina with OpenAI Codex</dd>
            </div>
          </dl>
        </section>

        <section className="about-section">
          <h2>How to help</h2>
          <p>
            Femicide is the terminal outcome of a wider system of violence. Effective work
            therefore includes survivor safety, prevention, legal reform, local organising,
            and ending practices such as FGM—not merely counting deaths after the fact.
          </p>
          <ul className="about-links about-links--charities">
            {charities.map((charity) => (
              <li key={charity.name}>
                <ExternalLink href={charity.href}>{charity.name}</ExternalLink>
                <span>{charity.detail}</span>
              </li>
            ))}
          </ul>
          <p className="about-note">
            These links are offered as starting points, not endorsements. Check an
            organisation’s current work, governance, and tax status before donating.
          </p>
        </section>

        <section className="about-section">
          <h2>Privacy policy</h2>
          <p>
            This site does not intentionally collect personal information, use analytics,
            set advertising cookies, or require an account. Enabling sound only activates
            audio generated in your browser; it does not access your microphone.
          </p>
          <p>
            The hosting provider may process ordinary technical data—such as IP address,
            browser information, request time, and security logs—to deliver and protect the
            site. Following an external link subjects you to that site’s own privacy policy.
          </p>
        </section>

        <section className="about-section about-section--legal">
          <h2>Important information</h2>
          <p>
            The displayed rates are research-based approximations, not official real-time
            totals. Definitions, reporting practices, survey coverage, under-reporting, and
            extrapolation introduce substantial uncertainty. Do not use this visualisation
            as a sole source for academic, legal, medical, policy, or journalistic claims;
            consult the original publications and, when available, the methodology paper.
          </p>
          <p>
            Source publications remain the property of their publishers. Organisation names
            and trademarks are used only for identification. The Bell is independent of, and
            is not sponsored or endorsed by, the cited institutions or charities.
          </p>
          <p>
            This site cannot provide crisis support. If you or someone else is in immediate
            danger, contact the emergency services or a specialist domestic- or sexual-
            violence service in your country.
          </p>
        </section>

        <footer className="about-panel__footer">
          <Link className="about-panel__back" href="/">
            Return to the field
          </Link>
          <span>Last updated August 2026</span>
        </footer>
      </article>
    </main>
  );
}
