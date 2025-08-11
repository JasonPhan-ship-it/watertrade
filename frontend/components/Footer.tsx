import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#004434] text-white">
      <div className="container mx-auto px-4">
        {/* Taller footer; adjust minHeight/padding as desired */}
        <div className="pt-8 pb-14" style={{ minHeight: 280 }}>
          {/* Top-left brand */}
          <div className="flex items-center gap-2">
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

          {/* Lower row: moved further down */}
          <div className="mt-24 sm:mt-28 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-white/80">© {year} Water Traders, LLC.</p>

            <nav className="flex items-center gap-4 text-sm">
              <Link href="/privacy" className="text-white/90 hover:text-white">
                Privacy Policy
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
