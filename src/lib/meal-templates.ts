export type MealTemplate = {
  id: number;
  name: string;
  plannedTime: string;
  food: string;
  notes: string;
  reminderOffset: string;
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
    reminderOffset: "15 min after planned time",
  },
  {
    id: 2,
    name: "Lunch topper",
    plannedTime: "1:00 PM",
    food: "Goat milk + sardine topper",
    notes: "Use half portion if breakfast ran late.",
    reminderOffset: "10 min after planned time",
  },
  {
    id: 3,
    name: "Dinner",
    plannedTime: "6:30 PM",
    food: "Beef raw bowl + greens",
    notes: "Main full meal. Add supplements here.",
    reminderOffset: "30 min after planned time",
  },
];

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
        "notes" in item &&
        "reminderOffset" in item
    )
  );
}
