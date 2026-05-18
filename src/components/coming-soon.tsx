import { PetNotebookTitle } from "@/components/pet-notebook-title";

export function ComingSoon() {
  return (
    <main className="min-h-screen bg-[var(--hewie-bg,#979ca7)] text-zinc-900">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12 text-center">
        <div className="w-full rounded-[2rem] bg-white/90 p-8 shadow-sm ring-1 ring-zinc-200">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[var(--hewie-active-text,#6d28d9)]"><PetNotebookTitle /></p>
          <h1 className="mt-3 text-xl font-bold tracking-tight text-zinc-700">Coming Soon</h1>
          <p className="mt-4 text-sm leading-6 text-zinc-600">
            <PetNotebookTitle /> is getting ready. A polished pet care tracker is on the way.
          </p>
        </div>
      </div>
    </main>
  );
}
