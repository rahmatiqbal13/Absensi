"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function KaryawanTabs({
  detailSlot,
  riwayatSlot,
}: {
  detailSlot: React.ReactNode;
  riwayatSlot: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="detail" className="space-y-4">
      <TabsList>
        <TabsTrigger value="detail">Detail</TabsTrigger>
        <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
      </TabsList>
      <TabsContent value="detail">{detailSlot}</TabsContent>
      <TabsContent value="riwayat">{riwayatSlot}</TabsContent>
    </Tabs>
  );
}
