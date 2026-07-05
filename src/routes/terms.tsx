import { createFileRoute, Link } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Orange Sound Guild" },
      {
        name: "description",
        content:
          "The Terms of Service governing your use of Orange Sound Guild — accounts, uploads, licenses, payments, and more.",
      },
      { property: "og:title", content: "Terms of Service — Orange Sound Guild" },
      {
        property: "og:description",
        content:
          "Read the Terms of Service for Orange Sound Guild, including artist ownership, listener licenses, and prohibited conduct.",
      },
      { property: "og:url", content: "https://orange-soundguild.lovable.app/terms" },
    ],
    links: [{ rel: "canonical", href: "https://orange-soundguild.lovable.app/terms" }],
  }),
  component: TermsPage,
});

function Section({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold tracking-tight">
        {n}. {title}
      </h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      {items.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <header className="border-b border-border pb-6">
          <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Effective Date:</span> July 5, 2026
          </p>
        </header>

        <div className="mt-6 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            Welcome to <span className="font-semibold text-foreground">Orange Sound Guild</span>{" "}
            ("Platform," "we," "our," or "us"). These Terms of Service ("Terms") govern your use
            of our website, applications, and services.
          </p>
          <p>
            By creating an account, uploading content, or using the Platform, you agree to these
            Terms. If you do not agree, please do not use the Platform.
          </p>
        </div>

        <Section n={1} title="Eligibility">
          <p>
            You must be at least 15 years old, or the minimum age required in your jurisdiction,
            to use the Platform. If you are under the age of majority in your jurisdiction, you
            must have permission from a parent or legal guardian.
          </p>
          <p>
            By creating an account, you represent that the information you provide is accurate
            and that you have the legal authority to agree to these Terms.
          </p>
        </Section>

        <Section n={2} title="Accounts">
          <p>You are responsible for maintaining the security of your account and password.</p>
          <p>You agree to:</p>
          <Bullets
            items={[
              "Provide accurate information.",
              "Keep your login credentials secure.",
              "Notify us immediately if you believe your account has been compromised.",
              "Be responsible for all activity occurring under your account.",
            ]}
          />
          <p>We may suspend or terminate accounts that violate these Terms.</p>
        </Section>

        <Section n={3} title="Artist Ownership">
          <p>
            Artists retain full ownership of all copyrights, trademarks, and other intellectual
            property rights in the music, artwork, videos, metadata, and other content they
            upload.
          </p>
          <p>Uploading content to the Platform does not transfer ownership to us.</p>
        </Section>

        <Section n={4} title="License Granted to the Platform">
          <p>
            To operate the Platform, you grant us a worldwide, non-exclusive, royalty-free,
            revocable license to:
          </p>
          <Bullets
            items={[
              "Host your content.",
              "Store your content.",
              "Stream your content.",
              "Display your content.",
              "Reproduce your content as necessary to provide the service.",
              "Generate previews and promotional snippets.",
              "Use artwork and metadata to promote your releases within the Platform.",
            ]}
          />
          <p>
            This license exists only for operating, improving, securing, and promoting the
            Platform.
          </p>
          <p>
            If you remove your content or close your account, this license ends except where
            copies remain in backups or where retention is required by law.
          </p>
        </Section>

        <Section n={5} title="Artist Responsibilities">
          <p>You represent and warrant that:</p>
          <Bullets
            items={[
              "You own or control all necessary rights to the content you upload.",
              "Your uploads do not infringe the intellectual property rights of others.",
              "Your content complies with applicable laws.",
              "Your metadata is accurate and not misleading.",
              "You have obtained all permissions required from collaborators, producers, labels, publishers, or featured artists.",
            ]}
          />
        </Section>

        <Section n={6} title="Listener License">
          <p>
            Listeners receive a limited, non-exclusive, non-transferable license to stream
            content through the Platform for personal, non-commercial use.
          </p>
          <p>Listeners may not:</p>
          <Bullets
            items={[
              "Download copyrighted music unless expressly permitted.",
              "Redistribute content.",
              "Record streams for commercial use.",
              "Remove copyright notices.",
              "Reverse engineer the Platform.",
            ]}
          />
        </Section>

        <Section n={7} title="Prohibited Conduct">
          <p>Users may not:</p>
          <Bullets
            items={[
              "Upload copyrighted material they do not own.",
              "Upload malware or harmful software.",
              "Use bots or automated systems without permission.",
              "Artificially manipulate stream counts.",
              "Purchase fake streams.",
              "Harass or threaten other users.",
              "Impersonate another person or organization.",
              "Engage in fraudulent activity.",
              "Upload illegal or unlawful content.",
            ]}
          />
          <p>Violations may result in account suspension or termination.</p>
        </Section>

        <Section n={8} title="Artificial Streaming">
          <p>
            The Platform prohibits artificial manipulation of streams, listeners, rankings,
            playlists, or revenue. This includes:
          </p>
          <Bullets
            items={[
              "Bots.",
              "Click farms.",
              "Stream farms.",
              "Automated playback.",
              "Purchased streams.",
              "Incentivized fake listening.",
              "Multiple accounts used to inflate statistics.",
            ]}
          />
          <p>
            We reserve the right to remove fraudulent streams, withhold related earnings, remove
            affected content, or suspend or terminate accounts involved in such activity.
          </p>
        </Section>

        <Section n={9} title="Payments and Royalties">
          <p>
            Where applicable, artists may receive payments based on streams or other monetization
            methods offered by the Platform.
          </p>
          <p>
            Payment terms, minimum payout thresholds, processing schedules, and available payment
            methods are described in our current payout policy.
          </p>
          <p>Artists are responsible for any taxes applicable to their earnings.</p>
          <p>
            We may delay payments where fraud, chargebacks, or legal obligations require
            investigation.
          </p>
        </Section>

        <Section n={10} title="Copyright Complaints">
          <p>We respect intellectual property rights.</p>
          <p>
            If you believe content infringes your copyright, you may submit a copyright complaint
            including sufficient information to identify the work, the allegedly infringing
            content, and proof of your authority to act on behalf of the rights holder.
          </p>
          <p>We may remove allegedly infringing material while investigating.</p>
          <p>Users may submit a counter-notification where permitted by applicable law.</p>
          <p>Repeat copyright infringers may have their accounts terminated.</p>
        </Section>

        <Section n={11} title="Content Removal">
          <p>We may remove or restrict access to content that:</p>
          <Bullets
            items={[
              "Violates these Terms.",
              "Violates applicable law.",
              "Infringes intellectual property rights.",
              "Poses security risks.",
              "Contains malicious software.",
              "Facilitates fraud or abuse.",
            ]}
          />
          <p>Where practical, we will provide notice explaining the reason for removal.</p>
        </Section>

        <Section n={12} title="Service Availability">
          <p>We strive to provide reliable service but do not guarantee uninterrupted availability.</p>
          <p>The Platform may experience maintenance, outages, bugs, or interruptions.</p>
          <p>Features may be modified, added, or discontinued over time.</p>
        </Section>

        <Section n={13} title="Privacy">
          <p>
            Our collection and use of personal information is governed by our Privacy Policy.
          </p>
          <p>
            By using the Platform, you acknowledge that your information will be processed as
            described in that policy.
          </p>
        </Section>

        <Section n={14} title="Third-Party Services">
          <p>
            The Platform may integrate with payment processors, analytics providers, social media
            platforms, or other third-party services.
          </p>
          <p>
            We are not responsible for the content, policies, or availability of third-party
            services.
          </p>
        </Section>

        <Section n={15} title="Suspension and Termination">
          <p>We may suspend or terminate accounts that:</p>
          <Bullets
            items={[
              "Violate these Terms.",
              "Engage in fraudulent activity.",
              "Abuse the Platform.",
              "Threaten the safety or security of users or the Platform.",
            ]}
          />
          <p>Users may delete their accounts at any time.</p>
          <p>
            Certain information may be retained where required by law or for legitimate
            operational purposes.
          </p>
        </Section>

        <Section n={16} title="Disclaimer of Warranties">
          <p>The Platform is provided "as is" and "as available."</p>
          <p>
            To the maximum extent permitted by law, we disclaim all warranties, express or
            implied, including warranties of merchantability, fitness for a particular purpose,
            and non-infringement.
          </p>
        </Section>

        <Section n={17} title="Limitation of Liability">
          <p>
            To the maximum extent permitted by law, we shall not be liable for indirect,
            incidental, consequential, special, exemplary, or punitive damages, including lost
            profits, lost revenue, lost data, or business interruption arising from your use of
            the Platform.
          </p>
          <p>
            Our total liability for any claim arising out of or relating to these Terms shall
            not exceed the amount you paid to the Platform during the twelve months preceding
            the event giving rise to the claim, or USD $100 if no payments were made, whichever
            is greater.
          </p>
        </Section>

        <Section n={18} title="Changes to These Terms">
          <p>We may update these Terms from time to time.</p>
          <p>
            Material changes will be communicated through the Platform or by email where
            appropriate.
          </p>
          <p>
            Continued use of the Platform after changes become effective constitutes acceptance
            of the updated Terms.
          </p>
        </Section>

        <Section n={19} title="Governing Law">
          <p>
            These Terms shall be governed by the laws of{" "}
            <span className="font-medium text-foreground">the Philippines</span>, without regard
            to conflict of law principles.
          </p>
        </Section>

        <Section n={20} title="Contact Us">
          <p>Questions about these Terms may be directed to:</p>
          <div className="rounded-xl border border-border bg-card p-4 text-foreground">
            <div className="font-semibold">Orange Sound Guild</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Email:{" "}
              <a
                href="mailto:booyakamix@gmail.com"
                className="text-primary underline-offset-4 hover:underline"
              >
                booyakamix@gmail.com
              </a>
            </div>
            <div className="text-sm text-muted-foreground">
              Website:{" "}
              <a
                href="https://orange-soundguild.lovable.app"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                orange-soundguild.lovable.app
              </a>
            </div>
          </div>
        </Section>

        <div className="mt-12 rounded-2xl border border-border bg-muted/30 p-6 text-sm text-muted-foreground">
          By using the Platform, you acknowledge that you have read, understood, and agree to be
          bound by these Terms of Service.{" "}
          <Link to="/" className="text-primary underline-offset-4 hover:underline">
            Back to home
          </Link>
          .
        </div>
      </main>
    </div>
  );
}
