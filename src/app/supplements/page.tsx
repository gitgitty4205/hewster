"use client";

import { Tablets } from "lucide-react";

import { CareSettingsPage } from "@/components/care-settings-page";

export default function SupplementsPage() {
  return (
    <CareSettingsPage
      kind="supplement"
      title="Supplement Settings"
      description="Create supplement schedules, reminders, and daily logs."
      emptyLabel="No supplements yet. Add supplements to appear with meals or as separate reminders."
      icon={Tablets}
      accentClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
      iconClassName="bg-[#eaf0f8] text-[#1f3d5c] ring-[#b8c9dd]"
    />
  );
}
