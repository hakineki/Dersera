import { GOREV_ISARETI, ISKELET_ISARETI } from "@/lib/composer/prompt";
import { getUniteler } from "@/data/mufredat/programlar";
import type { Durak, GameDefinition, Gorev } from "@/lib/composer/definition";
import { parseComposeInput, type ResolvedInput } from "@/lib/composer/input";
import type { ModelOutput } from "@/lib/composer/modelOutput";

export function resolvedInput(o: {
  sinif: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  ders: string | string[];
  sure: 20 | 40 | 60;
  deneyim: "macera" | "dengeli" | "ders";
  alan: "sinif" | "okul";
  uniteIndex?: number;
}): ResolvedInput {
  const dersler = (Array.isArray(o.ders) ? o.ders : [o.ders]).map((ders) => ({
    ders,
    konuId: getUniteler(o.sinif, ders).filter((u) => u.ogrenmeCiktilari.length > 0)[o.uniteIndex ?? 0].id,
  }));
  const r = parseComposeInput({ sinif: o.sinif, dersler, sure: o.sure, deneyim: o.deneyim, alan: o.alan });
  if (!r.ok) throw new Error(r.error);
  return r.input;
}

function gorev(hedef: string, i: number, odul: string | null): Gorev {
  return {
    tur: "coktan_secmeli",
    ogrenme_hedefi: hedef,
    soru: `Soru ${i}`,
    secenekler: ["A", "B", "C"],
    dogru_cevap: "B",
    ipucu_1: `İpucu ${i}.1`,
    ipucu_2: `İpucu ${i}.2`,
    destek_gorevi: { soru: `Destek ${i}`, secenekler: ["X", "Y"], dogru_cevap: "Y", aciklama: "Açıklama" },
    odul_id: odul,
  };
}

// Başlangıç → seçim (2 rota) → her rota bir nesne verir → birleşme → ... → final.
// Nesne n1 her iki rotada da kazanılır (ayrı ödüller aynı id'yi verir), n2 ortak durakta.
export function makeDefinition(input: ResolvedInput, durakSayisi = 6): GameDefinition {
  const hedefler = input.ogrenmeCiktilari.map((o) => o.kod);
  const h = (i: number) => hedefler[i % hedefler.length];
  const okul = input.alan === "okul";
  const mekan = (i: number) => ({
    tur: okul ? ("qr" as const) : ("sanal" as const),
    qr_durak_id: okul ? `qr-${i + 1}` : null,
    sonraki_durak_tarifi: okul ? `${i + 2} numaralı QR'ı bul` : "Sonraki sahneye geç",
  });
  const n = Math.max(5, durakSayisi);
  const duraklar: Durak[] = [];
  duraklar.push({ id: "d1", isim: "Başlangıç", sahne_turu: "gorev", hikaye_metni: "Giriş", mekan: mekan(0), gorev: gorev(h(0), 1, null), secimler: [], varsayilan_sonraki_durak_id: "d2" });
  duraklar.push({
    id: "d2", isim: "Yol Ayrımı", sahne_turu: "secim", hikaye_metni: "Nereye?", mekan: mekan(1), gorev: gorev(h(1), 2, null),
    secimler: [{ metin: "Laboratuvar", hedef_durak_id: "d3" }, { metin: "Kütüphane", hedef_durak_id: "d4" }],
    varsayilan_sonraki_durak_id: null,
  });
  duraklar.push({ id: "d3", isim: "Rota A", sahne_turu: "gorev", hikaye_metni: "A", mekan: mekan(2), gorev: gorev(h(2), 3, "n1"), secimler: [], varsayilan_sonraki_durak_id: "d5" });
  duraklar.push({ id: "d4", isim: "Rota B", sahne_turu: "gorev", hikaye_metni: "B", mekan: mekan(3), gorev: gorev(h(3), 4, "n1"), secimler: [], varsayilan_sonraki_durak_id: "d5" });
  for (let i = 5; i <= n; i++) {
    duraklar.push({
      id: `d${i}`, isim: `Durak ${i}`, sahne_turu: i === 5 ? "birlesme" : "gorev", hikaye_metni: `Sahne ${i}`, mekan: mekan(i - 1),
      gorev: gorev(h(i), i, i === 5 ? "n2" : null), secimler: [], varsayilan_sonraki_durak_id: i < n ? `d${i + 1}` : null,
    });
  }
  return {
    meta: { baslik: "Test Oyunu", sinif: input.sinif, ders: input.dersAdi, konu: input.konuAdi, sure_dk: input.sure, deneyim: input.deneyim, alan: input.alan },
    hikaye_giris: "Bir gizem başlıyor.",
    oyun_amaci: "Gizemi çöz.",
    ogrenme_hedefleri: hedefler.slice(0, 3),
    envanter: [
      { id: "n1", tur: "kanit", isim: "Kanıt", final_icin_gerekli: true },
      { id: "n2", tur: "anahtar", isim: "Anahtar", final_icin_gerekli: true },
    ],
    duraklar,
    final: {
      hikaye_metni: "Final",
      gerekli_nesneler: ["n1", "n2"],
      ogrenme_hedefleri: [h(0), h(1)],
      gorev_turu: "siralama",
      soru: "Kanıtları sırala",
      secenekler: ["İlk", "İkinci", "Üçüncü"],
      dogru_cevap: "İlk | İkinci | Üçüncü",
      basari_metni: "Başardın!",
    },
  };
}

// Parçalı üretimde her aşamanın yanıtı tam bir örnek oyundan türetilir: iskelet, istenen durakların görevleri ya da (düzeltmede) boş.
export function modelYaniti(out: ModelOutput | null, prompt: string): unknown {
  if (!out) return { yanlis: true };
  if (prompt.includes("Düzeltilecek duraklar")) return { duraklar: [] };
  if (prompt.includes(GOREV_ISARETI)) {
    const m = prompt.match(/Yalnız şu durakların görev içeriğini yaz ve duraklar dizisinde döndür: ([^\n]+)/);
    const ids = new Set(m ? m[1].split(",").map((s) => s.trim()) : []);
    return {
      duraklar: out.duraklar
        .filter((d) => ids.has(d.id))
        .map((d) => ({
          id: d.id, gorev_turu: d.gorev_turu, soru: d.soru, secenekler: d.secenekler, dogru_cevap: d.dogru_cevap, ipucu_1: d.ipucu_1,
          ipucu_2: d.ipucu_2, destek_soru: d.destek_soru, destek_secenekler: d.destek_secenekler, destek_dogru_cevap: d.destek_dogru_cevap,
          destek_aciklama: d.destek_aciklama,
        })),
    };
  }
  if (prompt.includes(ISKELET_ISARETI)) {
    return {
      baslik: out.baslik, hikaye_giris: out.hikaye_giris, oyun_amaci: out.oyun_amaci, ogrenme_hedefleri: out.ogrenme_hedefleri,
      envanter: out.envanter, final: out.final,
      duraklar: out.duraklar.map((d) => ({
        id: d.id, isim: d.isim, sahne_turu: d.sahne_turu, hikaye_metni: d.hikaye_metni, qr_durak_id: d.qr_durak_id,
        sonraki_durak_tarifi: d.sonraki_durak_tarifi, gorev_turu: d.gorev_turu, ogrenme_hedefi: d.ogrenme_hedefi, gorev_ozeti: d.soru,
        odul_id: d.odul_id, secimler: d.secimler, varsayilan_sonraki_durak_id: d.varsayilan_sonraki_durak_id,
      })),
    };
  }
  return out;
}

type Icerik = string | { type: string; text: string }[];
export const promptOf = (body: Record<string, unknown>) =>
  (body.messages as { content: Icerik }[])
    .map((m) => (typeof m.content === "string" ? m.content : m.content.map((b) => b.text).join("\n")))
    .join("\n");

export function fakeClient(output: ModelOutput | null, stop_reason = "end_turn") {
  const calls: { body: Record<string, unknown>; options: Record<string, unknown> }[] = [];
  return {
    calls,
    client: {
      messages: {
        create: (async (body: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ body, options });
          // output null: şemaya uymayan JSON.
          return { model: "test", usage: { output_tokens: 1 }, stop_reason, content: [{ type: "text", text: JSON.stringify(modelYaniti(output, promptOf(body))) }] };
        }) as never,
      },
    },
  };
}

// GameDefinition → modelin düz çıktısı (testlerde sahte model yanıtı olarak).
export function toModelOutput(def: GameDefinition): ModelOutput {
  return {
    baslik: def.meta.baslik,
    hikaye_giris: def.hikaye_giris,
    oyun_amaci: def.oyun_amaci,
    ogrenme_hedefleri: def.ogrenme_hedefleri,
    envanter: def.envanter,
    duraklar: def.duraklar.map((d) => ({
      id: d.id,
      isim: d.isim,
      sahne_turu: d.sahne_turu,
      hikaye_metni: d.hikaye_metni,
      qr_durak_id: d.mekan.qr_durak_id ?? "",
      sonraki_durak_tarifi: d.mekan.sonraki_durak_tarifi,
      gorev_turu: d.gorev.tur,
      ogrenme_hedefi: d.gorev.ogrenme_hedefi,
      soru: d.gorev.soru,
      secenekler: d.gorev.secenekler,
      dogru_cevap: d.gorev.dogru_cevap,
      ipucu_1: d.gorev.ipucu_1,
      ipucu_2: d.gorev.ipucu_2,
      destek_soru: d.gorev.destek_gorevi.soru,
      destek_secenekler: d.gorev.destek_gorevi.secenekler,
      destek_dogru_cevap: d.gorev.destek_gorevi.dogru_cevap,
      destek_aciklama: d.gorev.destek_gorevi.aciklama,
      odul_id: d.gorev.odul_id ?? "",
      secimler: d.secimler,
      varsayilan_sonraki_durak_id: d.varsayilan_sonraki_durak_id ?? "",
    })),
    final: def.final,
  };
}
