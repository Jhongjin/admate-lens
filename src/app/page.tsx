import { redirect } from "next/navigation";
import LensHomePageClient from "./LensHomePageClient";
import { getCurrentLensUser } from "@/lib/auth/lens-session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentLensUser();

  if (!user) {
    redirect("/login?next=%2F");
  }

  return <LensHomePageClient />;
}
