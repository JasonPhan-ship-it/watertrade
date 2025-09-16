// app/contact/page.tsx
export const runtime = "nodejs";

import Link from "next/link";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Contact | Water Traders",
  description:
    "Get in touch with Water Traders—questions about listings, transactions, or partnerships.",
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        {/* Header */}
        <div className="mb-6">
          <nav className="text-sm text-slate-500">
            <Link href="/" className="hover:text-slate-700">Home</Link>
            <span className="mx-2">/</span>
            <span className="text-slate-700">Contact</span>
          </nav>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            Contact Water Traders
          </h1>
          <p className="mt-2 text-slate-600">
            Have a question about a listing, escrow, or partnership? We’re here to help.
          </p>
        </div>

        {/* Two-column: Form + Info */}
        <div className="grid gap-6 lg:grid-cols-[1.2fr,0.8fr]">
          {/* Contact Form */}
          <Card className="rounded-2xl border-[#D8E3DE]">
            <CardHeader className="border-b border-[#E7EFEA]">
              <CardTitle className="text-lg">Send us a message</CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {/* 
                This form POSTs to /api/contact — add that route to deliver emails or tickets.
                Includes a honeypot field "company" for basic spam protection.
              */}
              <form
                action="/api/contact"
                method="POST"
                className="grid grid-cols-1 gap-4"
              >
                {/* Honeypot */}
                <div className="hidden">
                  <label htmlFor="company">Company</label>
                  <input id="company" name="company" type="text" tabIndex={-1} autoComplete="off" />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <div className="text-xs text-slate-600">First name</div>
                    <input
                      required
                      name="firstName"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#B6D3C8]"
                      placeholder="Jane"
                    />
                  </label>
                  <label className="block">
                    <div className="text-xs text-slate-600">Last name</div>
                    <input
                      required
                      name="lastName"
                      className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#B6D3C8]"
                      placeholder="Doe"
                    />
                  </label>
                </div>

                <label className="block">
                  <div className="text-xs text-slate-600">Email</div>
                  <input
                    required
                    type="email"
                    name="email"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#B6D3C8]"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <div className="text-xs text-slate-600">Subject</div>
                  <input
                    required
                    name="subject"
                    className="mt-1 h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-[#B6D3C8]"
                    placeholder="How can we help?"
                  />
                </label>

                <label className="block">
                  <div className="text-xs text-slate-600">Message</div>
                  <textarea
                    required
                    name="message"
                    rows={6}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#B6D3C8]"
                    placeholder="Share details about your question or request."
                  />
                </label>

                {/* (Optional) reCAPTCHA goes here */}

                <div className="mt-2 flex items-center gap-3">
                  <button
                    type="submit"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-[#004434] px-5 text-sm font-semibold text-white hover:bg-[#00392f]"
                  >
                    Send message
                  </button>
                  <span className="text-xs text-slate-500">
                    We’ll reply within 1–2 business days.
                  </span>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Company Info / Quick Links */}
          <div className="space-y-6">
            <Card className="rounded-2xl border-[#D8E3DE]">
              <CardHeader className="border-b border-[#E7EFEA]">
                <CardTitle className="text-lg">Contact details</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-3 text-sm text-slate-700">
                <div>
                  <div className="text-slate-500">Email</div>
                  <a className="text-[#0A6B58] underline" href="mailto:support@watertraders.com">
                    support@watertraders.com
                  </a>
                </div>
                <div>
                  <div className="text-slate-500">Sales</div>
                  <a className="text-[#0A6B58] underline" href="mailto:sales@watertraders.com">
                    sales@watertraders.com
                  </a>
                </div>
                <div>
                  <div className="text-slate-500">Partnerships</div>
                  <a className="text-[#0A6B58] underline" href="mailto:partners@watertraders.com">
                    partners@watertraders.com
                  </a>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-[#D8E3DE]">
              <CardHeader className="border-b border-[#E7EFEA]">
                <CardTitle className="text-lg">Resources</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 space-y-2 text-sm">
                <Link href="/pricing" className="text-[#0A6B58] underline">
                  Pricing
                </Link>
                <br />
                <Link href="/privacy" className="text-[#0A6B58] underline">
                  Privacy Policy
                </Link>
                <br />
                <Link href="/terms" className="text-[#0A6B58] underline">
                  Terms of Service
                </Link>
              </CardContent>
            </Card>

            {/* Map / Region (optional) */}
            <Card className="rounded-2xl border-[#D8E3DE]">
              <CardHeader className="border-b border-[#E7EFEA]">
                <CardTitle className="text-lg">Service areas</CardTitle>
              </CardHeader>
              <CardContent className="pt-6 text-sm text-slate-700">
                Central Valley, CA • Westlands • San Luis • Panoche • Arvin Edison
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
