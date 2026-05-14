import { NextResponse } from "next/server";

const FITBARK_API_BASE = "https://app.fitbark.com";

type FitBarkActivityRecord = {
  date: string;
  activity_value?: number;
  min_play?: number;
  min_active?: number;
  min_rest?: number;
  daily_target?: number;
  has_trophy?: number;
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Vancouver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function GET() {
  const dogSlug = process.env.FITBARK_DOG_SLUG;
  const accessToken = process.env.FITBARK_ACCESS_TOKEN;

  if (!dogSlug || !accessToken) {
    return NextResponse.json({
      configured: false,
      records: [],
      message: "FitBark needs FITBARK_DOG_SLUG and FITBARK_ACCESS_TOKEN in .env.local.",
    });
  }

  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 6);

  const response = await fetch(`${FITBARK_API_BASE}/api/v2/activity_series`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      activity_series: {
        slug: dogSlug,
        from: formatDate(from),
        to: formatDate(to),
        resolution: "DAILY",
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text();
    return NextResponse.json(
      {
        configured: true,
        records: [],
        message: "FitBark activity could not be loaded.",
        detail: detail.slice(0, 500),
      },
      { status: response.status }
    );
  }

  const payload = (await response.json()) as {
    activity_series?: {
      records?: FitBarkActivityRecord[];
    };
  };

  const records = payload.activity_series?.records ?? [];
  const todayKey = formatDate(new Date());
  const today = records.find((record) => record.date.startsWith(todayKey)) ?? records.at(-1) ?? null;
  const sevenDayActivity = records.reduce((total, record) => total + (record.activity_value ?? 0), 0);

  return NextResponse.json({
    configured: true,
    dogSlug,
    today,
    sevenDayActivity,
    records,
  });
}
