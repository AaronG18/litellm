"use client";

import useAuthorized from "@/app/(dashboard)/hooks/useAuthorized";
import LoadingScreen from "@/components/common_components/LoadingScreen";
import { LiteAdminPage } from "@/components/liteadmin/LiteAdmin";

export default function AriaRoutePage() {
  const { isLoading, isAuthorized } = useAuthorized();
  if (isLoading || !isAuthorized) {
    return <LoadingScreen />;
  }
  return (
    <div className="h-full">
      <LiteAdminPage />
    </div>
  );
}
