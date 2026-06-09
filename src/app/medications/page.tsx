"use client";

import { CareSettingsPage } from "@/components/care-settings-page";
import { MedicationPillIcon } from "@/components/medication-pill-icon";

export default function MedicationsPage() {
  return (
    <CareSettingsPage
      kind="medication"
      title="Medication Settings"
      description="Medication names, doses, schedules, refill notes, and reminders. Meal-linked meds show on Today&apos;s meal plan."
      emptyLabel="No Medications Yet. Add regular medications or custom reminders when your pet needs them."
      icon={MedicationPillIcon}
      accentClassName="bg-sky-50 text-sky-700 ring-sky-200"
      iconClassName="bg-sky-50 text-sky-600 ring-sky-200"
    />
  );
}
