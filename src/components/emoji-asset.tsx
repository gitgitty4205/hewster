const emojiAssetPaths = {
  health: "/emoji/noto-adhesive-bandage.svg",
  steak: "/emoji/noto-steak.svg",
} as const;

type EmojiAssetName = keyof typeof emojiAssetPaths;

type EmojiAssetProps = {
  name: EmojiAssetName;
  label: string;
  className?: string;
};

export function EmojiAsset({ name, label, className = "" }: EmojiAssetProps) {
  return (
    <span
      role="img"
      aria-label={label}
      className={`inline-block bg-contain bg-center bg-no-repeat ${className}`}
      style={{ backgroundImage: `url('${emojiAssetPaths[name]}')` }}
    />
  );
}
