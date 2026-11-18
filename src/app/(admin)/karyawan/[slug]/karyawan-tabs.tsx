"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export function KaryawanTabs({
  detailSlot,
  kontrakSlot,
  riwayatSlot,
}: {
  detailSlot: React.ReactNode;
  kontrakSlot?: React.ReactNode;
  riwayatSlot: React.ReactNode;
}) {
  return (
    <Tabs defaultValue="detail" className="space-y-4">
      <TabsList>
        <TabsTrigger value="detail">Detail</TabsTrigger>
        {kontrakSlot && <TabsTrigger value="kontrak">Kontrak</TabsTrigger>}
        <TabsTrigger value="riwayat">Riwayat</TabsTrigger>
      </TabsList>
      <TabsContent value="detail">{detailSlot}</TabsContent>
      {kontrakSlot && <TabsContent value="kontrak">{kontrakSlot}</TabsContent>}
      <TabsContent value="riwayat">{riwayatSlot}</TabsContent>
    </Tabs>
  );
}
