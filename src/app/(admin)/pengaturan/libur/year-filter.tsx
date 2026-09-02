"use client";

import { useRouter } from "next/navigation";
import { Field } from "@/components/field";
import { NativeSelect } from "@/components/ui/native-select";

export function YearFilter({ tahun }: { tahun: string }) {
  const router = useRouter();
  const now = new Date().getFullYear();
  const years = [now - 2, now - 1, now, now + 1].map(String);
  return (
    <Field id="tahun" label="Tahun">
      <NativeSelect
        defaultValue={tahun}
        onChange={(e) => router.push(`/pengaturan/libur?tahun=${e.target.value}`)}
        className="w-32"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );
}
