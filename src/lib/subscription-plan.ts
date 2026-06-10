import type { ActivityLog } from "@/lib/hewster-data";

export type SubscriptionPlanId = "free" | "plus";

export type SubscriptionPlan = {
  id: SubscriptionPlanId;
  name: string;
  priceLabel: string;
  summary: string;
  features: string[];
};

export const SUBSCRIPTION_PLAN_STORAGE_KEY = "petnotebook.subscriptionPlan";
export const SUBSCRIPTION_PLAN_CONFIRMED_STORAGE_KEY = "petnotebook.subscriptionPlanConfirmed";
export const SUBSCRIPTION_PLAN_UPDATED_EVENT = "petnotebook-subscription-plan-updated";
export const FREE_HISTORY_MONTHS = 3;
export const FREE_PET_LIMIT = 1;
export const PLUS_PET_LIMIT = 99;
export const FREE_MEDICAL_ATTACHMENT_USE_LIMIT = 1;
export const FREE_POTTY_IMAGE_USE_LIMIT = 1;
export const FREE_HISTORY_REPORT_USE_LIMIT = 1;
export const FREE_HISTORY_REPORT_USES_STORAGE_KEY = "petnotebook.freeHistoryReportUses";

export const subscriptionPlans: SubscriptionPlan[] = [
  {
    id: "free",
    name: "Free",
    priceLabel: "Basic with ads",
    summary: "",
    features: [
      "Track everyday pet care",
      "1 pet",
      "3 months of history",
    ],
  },
  {
    id: "plus",
    name: "PetNotebook Plus",
    priceLabel: "",
    summary: "Track every pet, share with caregivers, and keep records forever.",
    features: [
      "Unlimited pets",
      "Notebook sharing",
      "Keep everyone in sync",
      "Unlimited PDF reports",
      "Unlimited photos and files",
      "Lifetime health history",
      "Meals, reminders, and alerts",
      "Health records and daily logs",
    ],
  },
];

export function normalizeSubscriptionPlanId(value: unknown): SubscriptionPlanId {
  return value === "plus" ? "plus" : "free";
}

export function loadStoredSubscriptionPlan(): SubscriptionPlanId {
  if (typeof window === "undefined") return "free";
  const planId = normalizeSubscriptionPlanId(window.localStorage.getItem(SUBSCRIPTION_PLAN_STORAGE_KEY));
  if (planId !== "plus") return planId;
  return window.localStorage.getItem(SUBSCRIPTION_PLAN_CONFIRMED_STORAGE_KEY) === "1" ? "plus" : "free";
}

export function saveStoredSubscriptionPlan(planId: SubscriptionPlanId) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SUBSCRIPTION_PLAN_STORAGE_KEY, planId);
  if (planId === "plus") {
    window.localStorage.setItem(SUBSCRIPTION_PLAN_CONFIRMED_STORAGE_KEY, "1");
  } else {
    window.localStorage.removeItem(SUBSCRIPTION_PLAN_CONFIRMED_STORAGE_KEY);
  }
  window.dispatchEvent(new Event(SUBSCRIPTION_PLAN_UPDATED_EVENT));
}

export function subscriptionPlanById(planId: SubscriptionPlanId) {
  return subscriptionPlans.find((plan) => plan.id === planId) ?? subscriptionPlans[0];
}

export function petLimitForSubscriptionPlan(planId: SubscriptionPlanId) {
  return planId === "plus" ? PLUS_PET_LIMIT : FREE_PET_LIMIT;
}

export function loadFreeHistoryReportUses() {
  if (typeof window === "undefined") return 0;

  const stored = Number(window.localStorage.getItem(FREE_HISTORY_REPORT_USES_STORAGE_KEY) ?? "0");
  return Number.isFinite(stored) ? Math.max(0, stored) : 0;
}

export function saveFreeHistoryReportUses(count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(FREE_HISTORY_REPORT_USES_STORAGE_KEY, String(Math.max(0, count)));
}

export function activityAttachmentCounts(activityLogs: ActivityLog[], editingActivityId?: string | null) {
  return activityLogs.reduce(
    (counts, activity) => {
      if (activity.id === editingActivityId) return counts;

      let hasMedicalAttachment = false;
      let hasPottyImage = false;

      (activity.attachments ?? []).forEach((attachment) => {
        if (attachment.documentTypes.includes("Potty Image") || attachment.documentTypes.includes("Poop Photo")) {
          counts.pottyImages += 1;
          hasPottyImage = true;
          return;
        }

        counts.medicalAttachments += 1;
        hasMedicalAttachment = true;
      });

      if (hasMedicalAttachment) counts.medicalAttachmentUses += 1;
      if (hasPottyImage) counts.pottyImageUses += 1;

      return counts;
    },
    { medicalAttachments: 0, medicalAttachmentUses: 0, pottyImages: 0, pottyImageUses: 0 }
  );
}
