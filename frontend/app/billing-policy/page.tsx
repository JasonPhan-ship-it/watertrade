// frontend/app/billing-policy/page.tsx
export const metadata = {
  title: "Billing Policy • Water Traders",
};

export default function BillingPolicyPage() {
  return (
    <main className="container mx-auto max-w-3xl px-4 py-12 prose prose-slate">
      <h1>Billing Policy</h1>
      <p><strong>Last updated:</strong> August 14, 2025</p>

      <p>
        This Billing Policy explains how subscriptions, payments, refunds, and cancellations work
        for the Water Traders service (“<strong>Service</strong>”). By purchasing a plan, you agree
        to this policy in addition to our <a href="/terms">Terms &amp; Conditions</a>.
      </p>

      <h2>Plans &amp; Pricing</h2>
      <ul>
        <li>
          Current plan options, features, and prices are shown in-app on the{" "}
          <a href="/pricing">Pricing</a> page. We may update plan features or pricing in the future.
        </li>
        <li>
          If prices change, we’ll provide reasonable notice. Continued use after the effective date
          constitutes acceptance of the new pricing.
        </li>
        <li>
          Taxes (e.g., VAT, GST, sales tax) may apply based on your billing location and will be
          added to the total where required by law.
        </li>
      </ul>

      <h2>Payments &amp; Invoicing</h2>
      <ul>
        <li>
          Subscriptions are billed in advance on a recurring basis (e.g., monthly) unless otherwise
          specified at checkout.
        </li>
        <li>
          We process payments through third-party providers (e.g., Stripe). By subscribing, you
          authorize us and our processor to charge your payment method for recurring fees, taxes,
          and any overages or add-ons you select.
        </li>
        <li>
          If a payment fails, we may retry the charge and notify you to update your payment method.
          We may suspend or limit access until payment issues are resolved.
        </li>
      </ul>

      <h2>Free Trials &amp; Promotions</h2>
      <ul>
        <li>
          If offered, trials convert to paid subscriptions at the end of the trial unless you
          cancel before the trial ends. We’ll disclose trial terms during signup.
        </li>
        <li>
          Promotional pricing applies for the period stated; standard pricing resumes thereafter.
        </li>
      </ul>

      <h2>Upgrades, Downgrades &amp; Changes</h2>
      <ul>
        <li>
          <strong>Upgrades</strong> take effect immediately; we’ll prorate and charge the
          difference for the current cycle where applicable.
        </li>
        <li>
          <strong>Downgrades</strong> take effect at the start of your next billing cycle unless
          otherwise indicated. Feature limits for the lower plan will apply when the downgrade
          becomes effective.
        </li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Unless required by law, all charges are <strong>non-refundable</strong> and we do not
        provide partial refunds or credits for unused time in a billing period. If you believe there
        are extenuating circumstances, contact us within 30 days of the charge and we’ll review the
        request in good faith.
      </p>

      <h2>Cancellations</h2>
      <ul>
        <li>
          You can cancel anytime in your account settings or by contacting support. Your access will
          continue through the end of the current billing period.
        </li>
        <li>
          After cancellation, we may retain limited records as required for legal, tax, and auditing
          purposes (see our <a href="/privacy">Privacy Policy</a>).
        </li>
      </ul>

      <h2>Charge Disputes</h2>
      <p>
        If you believe a charge is incorrect, please contact us at{" "}
        <a href="mailto:support@watertraders.example">support@watertraders.example</a> within 30
        days of the charge. We’ll investigate and respond promptly.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about billing? Email{" "}
        <a href="mailto:support@watertraders.example">support@watertraders.example</a>.
      </p>
    </main>
  );
}
