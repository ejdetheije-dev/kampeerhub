export const TAG_LABELS: Record<string, string> = {
  dog: "honden",
  wifi: "wifi",
  pool: "zwembad",
  electricity: "stroom",
  nudism: "naturist",
};

export function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`w-4 h-4 ${filled ? "fill-[#ecad0a] stroke-[#ecad0a]" : "fill-none stroke-gray-500"}`}
      strokeWidth={2}
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}
