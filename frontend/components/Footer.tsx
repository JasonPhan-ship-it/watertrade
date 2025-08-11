import Link from "next/link";
import Image from "next/image";
import { Linkedin } from "lucide-react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative mt-16 text-white">
      {/* Curved top edge */}
      <div className="absolute inset-x-0 -top-8 h-10 overflow-hidden">
        <svg
          viewBox="0 0 1440 80"
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <path
            d="M0,40 C240,100 480,10 720,30 C960,50 1200,120 1440,60 L1440,0 L0,0 Z"
            fill="#004434"
          />
        </svg>
      </div>

      {/* Footer body */}
      <div className="bg-[#004434] pt-16 pb-10">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
            {/* Brand */}
            <div className="flex items-center gap-2">
              {/* If you added your circle mark here: /public/logo-mark.svg */}
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

            {/* Links + social */}
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

              <a
                href="https://www.linkedin.com"
                target="_blank"
                rel="noreferrer"
                aria-label="LinkedIn"
                className="ml-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
              >
                <Linkedin className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
