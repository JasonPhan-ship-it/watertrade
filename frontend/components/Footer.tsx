import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#004434] text-white">
      <div className="container mx-auto px-4">
        {/* Taller footer */}
        <div
          className="grid gap-8 sm:grid-cols-2"
          style={{ minHeight: 220, paddingTop: 28, paddingBottom: 28 }}
        >
          {/* Left column: brand at top-left, copyright left-aligned */}
          <div className="pt-4">
            <div className="flex items-center gap-2">
              {/* Circle mark at /public/logo-mark.svg */}
              <Image
                src="/logo-mark.svg"
                alt="Water Traders"
                width={36}
                height={36}
                className="shrink-0"
                priority
              />
              <span className="text-lg font-semibold">Water Traders</span>
            </div>

            <p className="mt-4 text-sm text-white/90">
              © {year} Water Traders, LLC.
            </p>
          </div>

          {/* Right column: policy links, aligned to the right on desktop */}
          <div className="pt-4 sm:self-end sm:justify-self-end">
            <nav className="flex flex-wrap items-center gap-4 text-sm justify-start sm:justify-end">
              <Link href="/privacy" className="text-white/90 hover:text-white">
                Privacy policy
              </Link>
              <span className="text-white/40">|</span>
              <Link href="/terms" className="text-white/90 hover:text-white">
                Terms &amp; Conditions
              </Link>
              <span className="text-white/40">|</span>
              <Link href="/billing" className="text-white/90 hover:text-white">
                Billing Policy
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
