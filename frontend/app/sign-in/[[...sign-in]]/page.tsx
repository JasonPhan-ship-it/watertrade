import { SignIn } from "@clerk/nextjs";

export default function Page() {
  return (
    <div className="mx-auto max-w-md py-12">
      <SignIn routing="hash" appearance={{ elements: { card: "shadow-none border rounded-2xl" } }} />
    </div>
  );
}
