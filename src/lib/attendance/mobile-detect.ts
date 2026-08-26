const MOBILE_UA_PATTERN = /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i;

export function isMobileUserAgent(userAgent: string | null): boolean {
  if (!userAgent) return false;
  return MOBILE_UA_PATTERN.test(userAgent);
}
