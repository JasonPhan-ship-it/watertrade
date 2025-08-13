"use client";

import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="min-h-[80vh] grid place-items-center px-4">
      <SignIn
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
        afterSignInUrl="/dashboard"
        logoImageUrl="/brand.svg"
        appearance={{
          variables: { colorPrimary: "#004434" },
          elements: {
            card: "rounded-2xl border border-slate-200 shadow-lg",
            formButtonPrimary: "bg-[#004434] hover:bg-[#00392f] text-white rounded-xl",
            formFieldInput:
              "rounded-xl border-slate-300 focus:ring-2 focus:ring-[#004434] focus:border-[#004434]",
            formFieldLabel: "text-slate-700",
            footerActionLink: "text-[#004434] hover:text-[#00392f]",
            formFieldAction: "text-[#004434] hover:text-[#00392f]",
            socialButtonsBlockButton:
              "rounded-xl border-slate-300 hover:bg-slate-50",
          },
        }}
      />
    </div>
  );
}
