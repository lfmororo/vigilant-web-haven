export function formatTimeAgo(date: string | Date): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffD = Math.floor(diffH / 24);

  if (diffMin < 1) return "agora";
  if (diffH < 1) return `${diffMin}min`;
  if (diffD < 1) return `${diffH}h ${diffMin % 60}min`;
  return `${diffD}d ${diffH % 24}h`;
}
