export const OFFICIAL_EQUITY_LOGOS: Record<string, string> = {
  OPENAI: "/logos/openai.png",
  TOPAI: "/logos/openai.png",
  "T-OPENAI": "/logos/openai.png",
  OPAI: "/logos/openai.png",

  SPACEX: "/logos/spacex.png",
  TSPACEX: "/logos/spacex.png",
  "T-SPACEX": "/logos/spacex.png",
  TSPX: "/logos/spacex.png",

  ANTHROPIC: "/logos/anthropic.png",
  CLAUDE: "/logos/anthropic.png",

  KALSHI: "/logos/kalshi.png",
  TKALSHI: "/logos/kalshi.png",
  "T-KALSHI": "/logos/kalshi.png",
  TKLS: "/logos/kalshi.png",

  ANDURIL: "/logos/anduril.png",
  FIGUREAI: "/logos/figureai.png",
  NEURALINK: "/logos/neuralink.png",
  POLYMARKET: "/logos/polymarket.png",

  STRIPE: "/logos/stripe.svg",
  TSTRIPE: "/logos/stripe.svg",
  "T-STRIPE": "/logos/stripe.svg",

  NVDA: "/logos/nvidia.svg",
  NVIDIA: "/logos/nvidia.svg",

  TSLA: "/logos/tesla.svg",
  TESLA: "/logos/tesla.svg",
};

export function getOfficialEquityLogo(symbolOrName?: string | null): string {
  if (!symbolOrName) return "/logos/openai.png";
  const clean = symbolOrName.toUpperCase().replace(/^\$/, "").trim();
  
  if (OFFICIAL_EQUITY_LOGOS[clean]) {
    return OFFICIAL_EQUITY_LOGOS[clean];
  }

  for (const [key, url] of Object.entries(OFFICIAL_EQUITY_LOGOS)) {
    if (clean.includes(key) || key.includes(clean)) {
      return url;
    }
  }

  return "/logos/openai.png";
}
