import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 bg-[#004434] text-white">
      <div className="container mx-auto px-4 py-12">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
          {/* Brand */}
          <div className="flex items-center gap-2">
            {/* Optional: circle mark at /public/logo-mark.svg */}
            <Image
              src="/logo-mark.svg"
              alt="Water Traders"
              width={28}
              height={28}
              className="shrink-0"
            />
            <span className="font-semibold">Water Traders</span>
          </div>

          {/* Center text */}
          <div className="text-sm text-white/90 text-center">
            © {year} Water Traders, LLC.
          </div>

          {/* Policy links */}
          <div className="flex items-center gap-4 text-sm">
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
          </div>
        </div>
      </div>
    </footer>
  );
}
