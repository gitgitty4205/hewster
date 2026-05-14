type Props = {
  className?: string;
};

export function MedicationPillIcon({ className = "size-4" }: Props) {
  return (
    <svg viewBox="0 0 16 16" className={className} aria-hidden="true">
      <path
        d="M5.1 13.2a3.05 3.05 0 0 1-2.16-5.21l5.05-5.05a3.05 3.05 0 1 1 4.31 4.31l-5.05 5.05a3.03 3.03 0 0 1-2.15.9Z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.15"
      />
      <path
        d="M7.99 2.94a3.05 3.05 0 0 1 4.31 4.31L9.77 9.78 5.46 5.47l2.53-2.53Z"
        fill="#ef4444"
      />
      <path d="M5.47 5.46l4.31 4.31" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}
