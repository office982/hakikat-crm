import { TenantProfileContent } from "@/components/tenant-profile/TenantProfileContent";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TenantProfilePage({ params }: PageProps) {
  const { id } = await params;
  return <TenantProfileContent tenantId={id} />;
}
