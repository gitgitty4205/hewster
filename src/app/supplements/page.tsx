"use client";

import { Tablets } from "lucide-react";

import { CareSettingsPage } from "@/components/care-settings-page";

export default function SupplementsPage() {
  return (
    <CareSettingsPage
      kind="supplement"
      title="Supplement Settings"
      description="Supplement names, doses, schedules, notes, and reminders. Meal-linked items show on Today&apos;s meal plan."
      emptyLabel="No Supplements Yet. Add daily supplements or anything that should appear with meals."
      icon={Tablets}
      accentClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      iconClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    />
  );
}
