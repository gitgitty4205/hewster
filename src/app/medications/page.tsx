"use client";

import { CareSettingsPage } from "@/components/care-settings-page";
import { MedicationPillIcon } from "@/components/medication-pill-icon";

export default function MedicationsPage() {
  return (
    <CareSettingsPage
      kind="medication"
      title="Medication Settings"
      description="Create medication schedules, reminders, and daily logs."
      emptyLabel="Save your pet's medications here to receive reminders and manage them from Today's Plan."
      icon={MedicationPillIcon}
      accentClassName="bg-sky-50 text-sky-700 ring-sky-200"
      iconClassName="bg-sky-50 text-sky-600 ring-sky-200"
    />
  );
}
