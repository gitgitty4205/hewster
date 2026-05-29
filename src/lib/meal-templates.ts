export type MealTemplate = {
  id: number;
  name: string;
  plannedTime: string;
  food: string;
  notes: string;
};

export type MealStatus = "done" | "upcoming" | "late";

export type DailyMeal = MealTemplate & {
  actualTime: string | null;
  status: MealStatus;
};

export const STORAGE_KEY = "hewster.mealTemplates";

export const initialTemplates: MealTemplate[] = [
  {
    id: 1,
    name: "Breakfast",
    plannedTime: "8:00 AM",
    food: "Turkey mix + kefir",
    notes: "Add pumpkin if stool was soft the night before.",
  },
  {
    id: 2,
    name: "Lunch topper",
    plannedTime: "1:00 PM",
    food: "Goat milk + sardine topper",
    notes: "Use half portion if breakfast ran late.",
  },
  {
    id: 3,
    name: "Dinner",
    plannedTime: "6:30 PM",
    food: "Beef raw bowl + greens",
    notes: "Main full meal. Add supplements here.",
  },
];

export function parseMealTemplateTimeToMinutes(value: string) {
  const normalized = value.trim().replace(/\s+/g, " ").toUpperCase();
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s?(AM|PM)$/);
  if (!match) return Number.POSITIVE_INFINITY;

  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? "0");
  const meridiem = match[3];

  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || minutes < 0 || minutes > 59) {
    return Number.POSITIVE_INFINITY;
  }

  if (meridiem === "PM" && hours !== 12) hours += 12;
  if (meridiem === "AM" && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

export function compareMealTemplatesByTime(a: MealTemplate, b: MealTemplate) {
  return parseMealTemplateTimeToMinutes(a.plannedTime) - parseMealTemplateTimeToMinutes(b.plannedTime) || a.id - b.id;
}

export function sortMealTemplatesByTime(templates: MealTemplate[]) {
  return [...templates].sort(compareMealTemplatesByTime);
}

function dayKeyFromDate(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function minutesFromDate(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

function mealTemplateCreatedAt(template: MealTemplate) {
  if (!Number.isFinite(template.id) || template.id < 1_600_000_000_000) return null;

  const createdAt = new Date(template.id);
  return Number.isNaN(createdAt.getTime()) ? null : createdAt;
}

export function isMealTemplateActiveForDay(template: MealTemplate, dayKey: string) {
  const createdAt = mealTemplateCreatedAt(template);
  if (!createdAt) return true;

  const createdDayKey = dayKeyFromDate(createdAt);
  if (dayKey < createdDayKey) return false;
  if (dayKey > createdDayKey) return true;

  return parseMealTemplateTimeToMinutes(template.plannedTime) >= minutesFromDate(createdAt);
}

export const initialDailyStatus: Pick<DailyMeal, "actualTime" | "status">[] = [
  { actualTime: "8:12 AM", status: "done" },
  { actualTime: null, status: "upcoming" },
  { actualTime: null, status: "late" },
];

export function isMealTemplateArray(value: unknown): value is MealTemplate[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "id" in item &&
        "name" in item &&
        "plannedTime" in item &&
        "food" in item &&
        "notes" in item
    )
  );
}
