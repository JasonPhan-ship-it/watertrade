import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#004434] text-white">
      <div className="container mx-auto px-4">
        <div className="pt-8 pb-14" style={{ minHeight: 280 }}>
          {/* Top-left brand: image + text lockup */}
          <div className="flex items-center">
            <Image
              src="/8.svg" // ensure this exists in /public
              alt="Water Traders, LLC"
              width={990}
              height={180}
              priority
              className="h-28 w-auto sm:h-32 md:h-36"
            />
          </div>

          {/* Lower row */}
          <div className="mt-24 sm:mt-28 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: © text at 80% opacity */}
            <p className="text-sm text-white/80">© {year} Water Traders, LLC.</p>

            {/* Right: policy links */}
            <nav
              className="flex items-center gap-4 text-sm"
              aria-label="Legal policies"
            >
              <Link href="/privacy-policy" className="text-white/90 hover:text-white">
                Privacy Policy
              </Link>
              <span className="text-white/40" aria-hidden="true">|</span>
              <Link href="/terms" className="text-white/90 hover:text-white">
                Terms &amp; Conditions
              </Link>
              <span className="text-white/40" aria-hidden="true">|</span>
              <Link href="/billing-policy" className="text-white/90 hover:text-white">
                Billing Policy
              </Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
