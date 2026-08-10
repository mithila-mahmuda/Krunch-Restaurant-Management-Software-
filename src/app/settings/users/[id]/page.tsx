"use client";

import { RequireAuth } from "@/components/auth/RequireAuth";
import { UserProfileScreen } from "@/components/settings/UserProfileScreen";

export default function UserProfilePage() {
  return (
    <RequireAuth>
      <UserProfileScreen />
    </RequireAuth>
  );
}
