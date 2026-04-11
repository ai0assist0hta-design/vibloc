import { SignupForm } from '@/features/auth/SignupForm';
import { PH } from '@/content/placeholders';

export function SignupPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mb-1 text-center text-[1.35rem] font-bold tracking-tight text-[#1a1a2e]">
        {PH.signup.pageTitle}
      </h1>
      <p className="mb-8 text-center text-[13px] leading-snug text-[#6e6e73]">{PH.signup.pageSubtitle}</p>
      <SignupForm />
    </div>
  );
}
