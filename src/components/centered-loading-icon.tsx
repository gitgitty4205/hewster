import Image from "next/image";

type CenteredLoadingIconProps = {
  className?: string;
};

export function CenteredLoadingIcon({ className = "" }: CenteredLoadingIconProps) {
  return (
    <section className={`flex min-h-[55dvh] items-center justify-center ${className}`} aria-label="Loading PetNoteBook" role="status">
      <div className="relative flex size-24 items-center justify-center">
        <span
          className="absolute inset-0 rounded-full border-2 border-white/35 border-t-white/95 shadow-[0_0_22px_rgba(255,255,255,0.35)] animate-spin"
          aria-hidden="true"
        />
        <Image
          src="/paw-notes-transparent.svg"
          alt=""
          width={64}
          height={64}
          draggable={false}
          className="relative h-16 w-16 object-contain drop-shadow-[0_8px_12px_rgba(15,23,42,0.28)] contrast-[1.04] saturate-[1.06]"
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
