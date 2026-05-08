import { redirect } from "next/navigation";
import LoginShell from "./LoginShell";
import { getCurrentLensUser, sanitizeLensNextPath } from "@/lib/auth/lens-session";

type LoginPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const nextValue = Array.isArray(resolvedSearchParams?.next)
    ? resolvedSearchParams?.next[0]
    : resolvedSearchParams?.next;
  const nextPath = sanitizeLensNextPath(nextValue);
  const user = await getCurrentLensUser();

  if (user) {
    redirect(nextPath);
  }

  return <LoginShell nextPath={nextPath} />;
}
