import { LoginForm } from '@/features/auth/LoginForm';
import { PH } from '@/content/placeholders';

export function LoginPage() {
  return (
    <div className="flex flex-col">
      <h1 className="mb-1 text-center text-[1.35rem] font-bold tracking-tight text-[#1a1a2e]">
        {PH.login.pageTitle}
      </h1>
      <p className="mb-8 text-center text-[13px] leading-snug text-[#6e6e73]">{PH.login.pageSubtitle}</p>
      <LoginForm />
    </div>
  );
}
