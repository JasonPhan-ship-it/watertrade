// app/privacy/page.tsx
export const metadata = {
  title: "Privacy Policy • Water Traders",
};

export default function PrivacyPolicyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12 prose prose-slate">
      <h1>Privacy Policy</h1>
      <p><strong>Last updated:</strong> August 14, 2025</p>

      <p>
        This Privacy Policy explains how Water Traders (“<strong>we</strong>,” “<strong>us</strong>,”
        or “<strong>our</strong>”) collects, uses, and shares information when you use our website
        and services (“<strong>Service</strong>”). This policy applies to personal information and
        other data we process about account holders, end users, and site visitors.
      </p>

      <h2>Information We Collect</h2>
      <ul>
        <li>
          <strong>Account &amp; Profile Data:</strong> name, email, phone (if provided), company,
          trade role, water type preferences, and similar onboarding information.
        </li>
        <li>
          <strong>Authentication Data:</strong> identifiers and tokens from our identity provider
          (e.g., Clerk) to log you in securely.
        </li>
        <li>
          <strong>Listing &amp; Transaction Data:</strong> information you or other users submit in
          connection with listings, bids, offers, and transactions.
        </li>
        <li>
          <strong>Payment Data:</strong> limited billing details and payment status via our payment
          processor (e.g., Stripe). We do not store full card numbers.
        </li>
        <li>
          <strong>Usage Data:</strong> device/browser details, pages viewed, referrers, timestamps,
          and interactions for security and product improvement.
        </li>
        <li>
          <strong>Cookies &amp; Similar Technologies:</strong> used for session management,
          preferences, analytics, and fraud prevention. See “Cookies &amp; Analytics.”
        </li>
      </ul>

      <h2>How We Use Information</h2>
      <ul>
        <li>Provide, maintain, and improve the Service and its features.</li>
        <li>Authenticate users, prevent fraud/abuse, and secure the platform.</li>
        <li>Facilitate listings, bids, offers, and transactions you initiate.</li>
        <li>
          Communicate with you about updates, security, billing, and customer support.
        </li>
        <li>Comply with legal, regulatory, and audit requirements.</li>
      </ul>

      <h2>Legal Bases (EEA/UK only)</h2>
      <p>
        Where applicable, we process personal data under these legal bases: performance of a
        contract, legitimate interests (e.g., security, product improvement), compliance with legal
        obligations, and consent (where required).
      </p>

      <h2>Sharing &amp; Disclosure</h2>
      <ul>
        <li>
          <strong>Service Providers:</strong> hosting and infrastructure (e.g., Vercel), database
          (Prisma/PostgreSQL), authentication (Clerk), payments (Stripe), email (Resend), analytics,
          and similar vendors under contractual safeguards.
        </li>
        <li>
          <strong>Transaction Counterparties:</strong> when you submit offers or initiate purchases,
          we may share necessary details to enable counterparties to evaluate and complete the deal.
        </li>
        <li>
          <strong>Legal &amp; Safety:</strong> to comply with law, enforce terms, or protect rights,
          property, and safety.
        </li>
        <li><strong>No Sale of Personal Information.</strong></li>
      </ul>

      <h2>International Transfers</h2>
      <p>
        We may process data in countries different from your own. Where required, we use
        appropriate safeguards (e.g., Standard Contractual Clauses) for cross-border transfers.
      </p>

      <h2>Retention</h2>
      <p>
        We retain information for as long as necessary to provide the Service, comply with legal
        obligations, resolve disputes, and enforce agreements. Retention periods vary by data type.
      </p>

      <h2>Security</h2>
      <p>
        We use reasonable administrative, technical, and physical safeguards designed to protect
        information. However, no method of transmission or storage is 100% secure.
      </p>

      <h2>Your Choices &amp; Rights</h2>
      <ul>
        <li>Access, correct, or delete certain account/profile information in-app.</li>
        <li>Manage email preferences or opt out of non-essential communications.</li>
        <li>
          If you are in the EEA/UK or certain U.S. states (e.g., California), you may have rights
          to access, delete, correct, or opt out of certain processing. Contact us to exercise these
          rights; we will verify your request consistent with applicable law.
        </li>
      </ul>

      <h2>Cookies &amp; Analytics</h2>
      <p>
        We use cookies and similar technologies to keep you signed in, remember preferences, and
        understand usage. You can control cookies via your browser settings; disabling some cookies
        may impact functionality.
      </p>

      <h2>Children</h2>
      <p>The Service is not directed to children under 16 and they may not use the Service.</p>

      <h2>Changes to this Policy</h2>
      <p>
        We may update this Privacy Policy from time to time. If changes are material, we’ll provide
        notice in the app or by email. Continued use after updates indicates acceptance.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests? Email{" "}
        <a href="mailto:support@watertraders.example">support@watertraders.example</a>.
      </p>
    </main>
  );
}
