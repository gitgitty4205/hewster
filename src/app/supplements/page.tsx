"use client";

import { Tablets } from "lucide-react";

import { CareSettingsPage } from "@/components/care-settings-page";

export default function SupplementsPage() {
  return (
    <CareSettingsPage
      kind="supplement"
      title="Supplement Settings"
      description="Saved supplements used to create schedules, reminders, and logs."
      emptyLabel="No supplements yet. Add daily supplements or anything that should appear with meals."
      icon={Tablets}
      accentClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      iconClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    />
  );
}
