import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { getCurrentEmployee } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/branding/get-app-settings";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { saveAppSettings, uploadLogo, removeLogo } from "./actions";
import { InstansiForm } from "./instansi-form";

export default async function InstansiPage() {
  const db = await createServerSupabaseClient();
  const employee = await getCurrentEmployee(db);
  if (!employee) redirect("/login");
  if (employee.role !== "super_admin") redirect("/pengaturan");

  const defaults = await getAppSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Instansi"
        description="Identitas organisasi yang tampil di seluruh aplikasi, login, dan dokumen."
      />
      <InstansiForm
        defaults={defaults}
        saveAppSettings={saveAppSettings}
        uploadLogo={uploadLogo}
        removeLogo={removeLogo}
      />
    </div>
  );
}
