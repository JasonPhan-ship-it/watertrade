function normalizeBalanceSearchSpace(html: string): string {
  return html
    .replace(/&(nbsp|#160);/gi, " ")
    .replace(/\s+/g, " ");
}

export function extractBalance(html: string): { text: string | null; value: number | null } {
  const normalizedHtml = normalizeBalanceSearchSpace(html);
  const match = normalizedHtml.match(
    /Balance\s+as\s+of\s+Last\s+Statement[^\d$]*([$\d,\.\-\s]+)/i,
  );
  if (!match) return { text: null, value: null };

  const text = match[1].trim();
  const normalized = text.replace(/[^\d.-]/g, "");
  const value = normalized ? Number(normalized) : null;

  return {
    text,
    value: Number.isFinite(value) ? value : null,
  };
}
