"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type LoginShellProps = {
  nextPath: string;
};

type LoginResponse = {
  next?: string;
  error?: string;
};

const loginProofLanes = [
  {
    label: "SOURCE",
    title: "원본 접수",
    detail: "소재 URL과 랜딩을 보호된 세션에서만 엽니다.",
  },
  {
    label: "RENDER",
    title: "지면 재현",
    detail: "매체 화면에 맞춘 렌더 결과를 로그인 후 확인합니다.",
  },
  {
    label: "QA",
    title: "검수 판정",
    detail: "품질 플래그와 실패 사유는 계정 권한으로 조회합니다.",
  },
] as const;

export default function LoginShell({ nextPath }: LoginShellProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          next: nextPath,
        }),
      });

      const payload = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setError(payload.error ?? "로그인에 실패했습니다.");
        return;
      }

      router.replace(payload.next ?? nextPath);
      router.refresh();
    } catch {
      setError("로그인 요청 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="lens-login-shell min-h-screen bg-[var(--color-bg-primary)] px-4 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center">
        <section className="grid w-full gap-6 lg:grid-cols-[minmax(0,1.1fr)_420px]">
          <div className="lens-login-brief rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 lg:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              lens.admate.ai.kr · Evidence Gate
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-normal">AdMate Lens 증빙 데스크</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--color-text-secondary)]">
              광고 캡처 원본, 렌더 결과, QA 판정, 보존 기록은 보호된 운영 증거입니다.
              AdMate 계정으로 로그인한 뒤 지면별 증빙 워크벤치로 이동합니다.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
              로그인 후 현재 보려던 Lens 화면으로 돌아갑니다. 세션 없이 캡처 API나 결과 목록은 호출하지 않습니다.
            </p>

            <div className="lens-login-rail" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>

            <div className="lens-login-proof-grid">
              {loginProofLanes.map((lane) => (
                <article className="lens-login-proof-card" key={lane.label}>
                  <p>{lane.label}</p>
                  <strong>{lane.title}</strong>
                  <span>{lane.detail}</span>
                </article>
              ))}
            </div>
          </div>

          <div className="lens-login-card rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-6 lg:p-8">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
                Evidence Gate
              </p>
              <h2 className="mt-2 text-xl font-semibold text-[var(--color-text-primary)]">
                증빙 큐 열기
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
                인증된 계정만 원본 접수, 렌더 검수, 보존 이력 확인을 진행할 수 있습니다.
              </p>
            </div>

            <form className="space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" htmlFor="email">
                  이메일
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  placeholder="name@company.com"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--color-text-secondary)]" htmlFor="password">
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2.5 text-sm text-[var(--color-text-primary)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  placeholder="비밀번호를 입력하세요"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-sm text-[var(--color-error)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-text-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? "증빙 큐 확인 중..." : "증빙 데스크 입장"}
              </button>
            </form>

            <div className="mt-6 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] p-4">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">
                접근 권한이 없다면 Sentinel 요청
              </p>
              <p className="text-xs leading-5 text-[var(--color-text-secondary)]">
                Lens 증빙 워크벤치 권한은 Sentinel access-request 흐름에서 관리합니다.
              </p>
              <a
                href="https://sentinel.admate.ai.kr/access-request"
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
              >
                Sentinel 접근 요청
              </a>
              <Link
                href="/"
                className="inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-primary)]"
              >
                Lens 홈으로 돌아가기
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
