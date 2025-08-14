// app/terms/page.tsx
export const metadata = {
  title: "Terms & Conditions • Water Traders",
};

export default function TermsPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12 prose prose-slate">
      <h1>Terms &amp; Conditions</h1>
      <p><strong>Last updated:</strong> August 14, 2025</p>

      <p>
        These Terms &amp; Conditions (“<strong>Terms</strong>”) govern your access to and use of the
        Water Traders website and services (“<strong>Service</strong>”). By using the Service, you
        agree to these Terms.
      </p>

      <h2>Eligibility &amp; Accounts</h2>
      <ul>
        <li>You must be able to form a binding contract and comply with applicable laws.</li>
        <li>
          You are responsible for your account credentials and all activity under your account.
          Notify us immediately of unauthorized use.
        </li>
        <li>
          You must provide accurate, current information and keep it updated, including during
          onboarding.
        </li>
      </ul>

      <h2>Marketplace Role</h2>
      <ul>
        <li>
          Water Traders is a marketplace platform that helps users discover, list, and transact
          water-related rights or services. We are <strong>not</strong> a party to transactions
          between users.
        </li>
        <li>
          You are solely responsible for the accuracy and legality of your listings, offers, bids,
          and transactions, and for obtaining any required approvals, disclosures, or regulatory
          compliance related to your activities.
        </li>
      </ul>

      <h2>User Content &amp; Conduct</h2>
      <ul>
        <li>
          You retain ownership of content you submit but grant us a license to host, display, and
          process it to operate the Service.
        </li>
        <li>
          You will not post or use the Service for unlawful activities, fraud, infringement,
          misrepresentation, or to circumvent security or access controls.
        </li>
        <li>
          We may remove content and/or suspend accounts that violate these Terms or applicable law.
        </li>
      </ul>

      <h2>Transactions &amp; Payments</h2>
      <ul>
        <li>
          Transactions initiated on the Service may be subject to additional terms, payments, and
          verification, including e-signature flows and compliance checks.
        </li>
        <li>
          Payment processing is provided by third parties (e.g., Stripe). Your use of those
          services may be subject to their terms and privacy notices.
        </li>
        <li>
          Subscription fees and billing are governed by our{" "}
          <a href="/legal/billing">Billing Policy</a>.
        </li>
      </ul>

      <h2>Third-Party Services</h2>
      <p>
        The Service may integrate with third-party services (e.g., identity, email, analytics).
        We’re not responsible for third-party services or content; your use of them is at your own
        risk and may be subject to separate terms.
      </p>

      <h2>Intellectual Property</h2>
      <p>
        The Service, including software, design, and brand elements, is protected by intellectual
        property laws. Except for your content and rights expressly granted, we reserve all rights.
      </p>

      <h2>Feedback</h2>
      <p>
        If you provide feedback or suggestions, you grant us a royalty-free, perpetual license to
        use it without restriction.
      </p>

      <h2>Termination</h2>
      <p>
        You may stop using the Service at any time. We may suspend or terminate your access for
        violations of these Terms, legal requirements, or risks to the Service or other users.
      </p>

      <h2>Disclaimers</h2>
      <p>
        The Service is provided on an “as is” and “as available” basis. We disclaim all warranties,
        express or implied, including merchantability, fitness for a particular purpose, and
        non-infringement. We do not guarantee continuous, error-free operation or specific outcomes.
      </p>

      <h2>Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, Water Traders and its affiliates will not be liable
        for indirect, incidental, special, consequential, or punitive damages, or for loss of
        profits, revenue, data, or goodwill. Our aggregate liability for claims relating to the
        Service will not exceed the greater of (a) amounts paid by you to us for the Service in the
        12 months before the event giving rise to liability, or (b) USD $100.
      </p>

      <h2>Indemnification</h2>
      <p>
        You agree to indemnify and hold harmless Water Traders and its affiliates from claims,
        losses, liabilities, and expenses (including reasonable attorneys’ fees) arising from your
        use of the Service, your content, or your violation of these Terms or applicable law.
      </p>

      <h2>Governing Law &amp; Disputes</h2>
      <p>
        These Terms are governed by the laws of the jurisdiction where Water Traders is organized,
        without regard to conflict of laws rules. Disputes will be resolved in the courts located in
        that jurisdiction unless otherwise required by law.
      </p>

      <h2>Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be communicated in-app or
        by email. Your continued use after changes become effective constitutes acceptance.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these Terms? Email{" "}
        <a href="mailto:support@watertraders.example">support@watertraders.example</a>.
      </p>
    </main>
  );
}
