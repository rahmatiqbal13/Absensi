import { describe, it, expect } from "vitest";
import { terbilang, terbilangRupiah } from "./terbilang";

describe("terbilang", () => {
  it.each([
    [0, "nol"],
    [1, "satu"],
    [10, "sepuluh"],
    [11, "sebelas"],
    [12, "dua belas"],
    [19, "sembilan belas"],
    [20, "dua puluh"],
    [45, "empat puluh lima"],
    [100, "seratus"],
    [115, "seratus lima belas"],
    [999, "sembilan ratus sembilan puluh sembilan"],
    [1000, "seribu"],
    [1001, "seribu satu"],
    [2500, "dua ribu lima ratus"],
    [11_000, "sebelas ribu"],
    [100_000, "seratus ribu"],
    [1_000_000, "satu juta"],
    [1_250_000, "satu juta dua ratus lima puluh ribu"],
    [9_900_000, "sembilan juta sembilan ratus ribu"],
    [2_000_000_000, "dua miliar"],
  ])("%i -> %s", (n, words) => {
    expect(terbilang(n)).toBe(words);
  });

  it("formats rupiah, rounding to whole rupiah", () => {
    expect(terbilangRupiah(4_752_380.95)).toBe("Empat juta tujuh ratus lima puluh dua ribu tiga ratus delapan puluh satu rupiah");
  });
});
