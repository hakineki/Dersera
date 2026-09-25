"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import DerseraLogo from "@/components/DerseraLogo";
import type { KonuSecenegi, OgrenmeCiktisi } from "@/data/mufredat/programlar";
import { validationContext } from "@/lib/composer/context";
import type { GameDefinition } from "@/lib/composer/definition";
import type { YzDenetim } from "@/lib/composer/yzDenetim";
import { guncellemeyiBirlestir } from "@/lib/composer/guncellemeBirlestir";
import { validateGame, type ValidationResult } from "@/lib/composer/validator";
import { oturumBilgisi } from "@/lib/authClient";
import { saveTeacherGame } from "@/lib/teacherGame";
import { kutuphaneOyunu, kutuphaneyeKaydet, toplulukOyunu } from "@/lib/libraryClient";
import { okulOyunu } from "@/lib/okulClient";
import type { PublishResponse } from "@/lib/gamesClient";
import ComposerPreview, { type GorselIlerleme } from "./ComposerPreview";
import OgrenciDemo from "@/app/game/composer/OgrenciDemo";
import { gorselleriBirlestir } from "@/lib/gorsel";
import { gorselDurumuGetir, gorselTetikle, type GorselDurumuYaniti } from "@/lib/gorselClient";
import DurakEditor, { type Duzenlenen } from "./DurakEditor";
import KaynakGirdisi from "./KaynakGirdisi";
import { ALAN_SECENEKLERI, DENEYIM_SECENEKLERI } from "./labels";
import { maxDersSayisi } from "@/lib/composer/recipe";
import { SERBEST_NOT_MAX } from "@/lib/composer/limits";
import { KAYNAK, kaynakNormal } from "@/lib/composer/kaynak";
import { KREDI_KURALLARI, olusturmaMaliyeti, type KrediDurumu } from "@/lib/kredi";
import { krediDurumuGetir, krediMetni } from "@/lib/krediClient";

// Oluşturma formu üç bölüm (docs/URUN-BAGLAMI.md §4): tek sayfa, belge benzeri.
const BOLUM = "bg-white border border-gray-200 rounded-2xl p-4 sm:p-5 space-y-5";
const BOLUM_BASLIK = "text-base font-bold text-indigo-900";

const CLIENT_TIMEOUT_MS = 285_000;
// Sunucu yarıda kalan görseli 70 sn sonra yeniden sahiplenebilir (lib/gorselService.ts).
const GORSEL_YENIDEN_DENEME_MS = 75_000; // sunucu en geç maxDuration'da (280 sn) kesilir; istemci ondan sonra vazgeçer
// Yükleme adımları (docs/URUN-BAGLAMI.md §11) ve yaklaşık başlama saniyeleri; üretim 1,5–3 dakika sürer.
const MESAJLAR = [
  "Müfredat hazırlanıyor",
  "Hikâye kurgulanıyor",
  "Görevler oluşturuluyor",
  "Oyun akışı kontrol ediliyor",
  "Yaşa uygunluk ve çocuk güvenliği kontrol ediliyor",
  "Son kalite kontrolü yapılıyor",
];
const ADIM_SANIYE = [0, 10, 30, 90, 130, 160];

type Durum =
  | { tur: "form" }
  | { tur: "yukleniyor" }
  | { tur: "hata"; mesaj: string; kutuphane?: boolean }
  | { tur: "onizleme" };

interface DersKonu {
  ders: string;
  konuId: string;
}

interface ComposeResponse {
  definition: GameDefinition;
  validation: ValidationResult;
  // Sunucudaki yapay zekâ denetimi ve hangi tanım için yapıldığı (düzenleme yeni tanım üretir; denetim yayında yenilenir).
  guvenlik?: YzDenetim;
  guvenlikTanimi?: GameDefinition;
  dersler: DersKonu[];
  hedefler: OgrenmeCiktisi[];
  hedefDersleri: Record<string, string[]>;
  // Görsel zenginleştirme istendiyse: sunucuda kurulan iş ya da kurulamadıysa öğretmene not.
  gorselIsi?: { isId: string; hedefler: string[] };
  gorselNotu?: string;
}

function Secim<T extends string | number>({
  etiket,
  secenekler,
  deger,
  onChange,
  pasif,
}: {
  etiket: string;
  secenekler: { key: T; ad: string; ikon?: string; aciklama?: string }[];
  deger: T;
  onChange: (v: T) => void;
  pasif?: (v: T) => boolean;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold text-gray-700 mb-2">{etiket}</legend>
      <div className={`grid gap-2 ${secenekler.some((s) => s.aciklama) ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-2 sm:grid-cols-4"}`}>
        {secenekler.map((s) => {
          const kapali = pasif?.(s.key) ?? false;
          return (
            <button
              key={String(s.key)}
              type="button"
              aria-pressed={deger === s.key}
              disabled={kapali}
              onClick={() => onChange(s.key)}
              className={`text-left rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                deger === s.key ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
              }`}
            >
              <span className="font-semibold">
                {s.ikon && <span aria-hidden="true">{s.ikon} </span>}
                {s.ad}
              </span>
              {s.aciklama && <span className="block text-xs text-gray-500 mt-0.5">{s.aciklama}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function Yukleniyor({ ilerleme, adim }: { ilerleme: number; adim: number }) {
  return (
    <div className="py-16 text-center">
      <div className="text-5xl mb-4 motion-safe:animate-pulse" aria-hidden="true">
        🧭
      </div>
      <p className="font-bold text-gray-900 text-lg">Dersera oyununuzu oluşturuyor...</p>
      <p className="sr-only" role="status" aria-live="polite">
        {MESAJLAR[adim]}
      </p>
      <ol className="mt-4 inline-block text-left space-y-1.5 text-sm" aria-label="Oluşturma adımları">
        {MESAJLAR.map((m, i) => (
          <li key={m} className={i < adim ? "text-green-700" : i === adim ? "text-indigo-800 font-semibold" : "text-gray-400"}>
            <span aria-hidden="true" className="inline-block w-5">
              {i < adim ? "✓" : i === adim ? "›" : "·"}
            </span>
            {m}
            <span className="sr-only">{i < adim ? " (tamamlandı)" : i === adim ? " (sürüyor)" : ""}</span>
          </li>
        ))}
      </ol>
      <div
        className="mt-6 h-2 bg-gray-200 rounded-full overflow-hidden max-w-sm mx-auto"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ilerleme)}
      >
        <div className="h-full bg-indigo-600 motion-safe:transition-[width] motion-safe:duration-500" style={{ width: `${ilerleme}%` }} />
      </div>
    </div>
  );
}

export default function ComposerClient({
  siniflar,
  dersler,
  konular,
  gorselEtkin,
}: {
  siniflar: number[];
  dersler: { key: string; ad: string }[];
  konular: Record<string, KonuSecenegi[]>;
  // Görsel sağlayıcı ve depo yapılandırılmışsa onay kutusu gösterilir.
  gorselEtkin: boolean;
}) {
  const router = useRouter();
  const [ogretmen, setOgretmen] = useState<boolean | null>(null);
  const [sinif, setSinif] = useState(10);
  // Seçim sırası korunur; her seçili dersin kendi konusu vardır.
  const [secili, setSecili] = useState<DersKonu[]>([{ ders: "fizik", konuId: konular["10:fizik"]?.[0]?.id ?? "" }]);
  const [sure, setSure] = useState<20 | 40 | 60>(40);
  const [deneyim, setDeneyim] = useState<"macera" | "dengeli" | "ders">("dengeli");
  const [alan, setAlan] = useState<"sinif" | "okul">("sinif");
  const [onNot, setOnNot] = useState("");
  // Öğretmenin kaynağı yalnız bu sayfanın belleğinde tutulur (saklanmaz).
  const [kaynak, setKaynak] = useState("");
  const [gorsel, setGorsel] = useState(false);
  const [gorselIlerleme, setGorselIlerleme] = useState<GorselIlerleme | null>(null);
  // Yalnız son oluşturulan oyunun görselleri tanıma eklenir (öğretmen yeni oyuna geçtiyse eski yanıtlar yok sayılır).
  const aktifGorselIsi = useRef<string | null>(null);

  const [durum, setDurum] = useState<Durum>({ tur: "form" });
  const [ilerleme, setIlerleme] = useState(0);
  const [mesajNo, setMesajNo] = useState(0);
  const [sonuc, setSonuc] = useState<ComposeResponse | null>(null);
  const [duzenlenen, setDuzenlenen] = useState<Duzenlenen | null>(null);
  // Öğrenci gözüyle demo açık mı (önizlemedeki güncel tanımla, tam ekran).
  const [demo, setDemo] = useState(false);
  const [yayinlaniyor, setYayinlaniyor] = useState(false);
  const [yayinHatasi, setYayinHatasi] = useState("");
  // Kütüphane kaydı: id yoksa henüz kaydedilmedi; degisti, kayıttan sonra düzenlendi demektir.
  const [kutuphaneId, setKutuphaneId] = useState<string | null>(null);
  const [kutuphaneDurumu, setKutuphaneDurumu] = useState<"kayitsiz" | "degisti" | "kaydedildi" | "kaydediliyor">("kayitsiz");
  const [kutuphaneHatasi, setKutuphaneHatasi] = useState("");
  const [kutuphaneBilgisi, setKutuphaneBilgisi] = useState("");
  const [kutuphaneSurum, setKutuphaneSurum] = useState<number | undefined>(undefined);
  const [toplulukKopyasi, setToplulukKopyasi] = useState(false);
  const [okulKopyasi, setOkulKopyasi] = useState(false);
  // "Oyunu Kullan" kopyasının topluluk kimliği: ilk kütüphane kaydına kaynak olarak yazılır (öğretmen puanı için).
  const [toplulukKaynagi, setToplulukKaynagi] = useState<string | null>(null);
  const istek = useRef<AbortController | null>(null);
  const sonTanim = useRef<GameDefinition | null>(null);
  useEffect(() => {
    sonTanim.current = sonuc?.definition ?? null;
  }, [sonuc]);

  const [kredi, setKredi] = useState<KrediDurumu | null>(null);
  useEffect(() => {
    const t = setTimeout(async () => {
      const girisli = !!(await oturumBilgisi())?.hesap;
      setOgretmen(girisli);
      if (girisli) setKredi(await krediDurumuGetir());
    });
    return () => clearTimeout(t);
  }, []);

  // /composer?sinif=<n>&ders=<anahtar>&konu=<ünite>&not=<metin>: form bu seçimlerle açılır (öğrenme takibinden pekiştirme
  // oyunu). Programda olmayan seçim yok sayılır; öğretmen oluşturmadan önce her şeyi değiştirebilir.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = Number(params.get("sinif"));
    const ders = params.get("ders") ?? "";
    const konu = params.get("konu");
    if (!konu || !siniflar.includes(s) || !konular[`${s}:${ders}`]?.some((u) => u.id === konu)) return;
    const not = (params.get("not") ?? "").slice(0, SERBEST_NOT_MAX);
    const t = setTimeout(() => {
      setSinif(s);
      setSecili([{ ders, konuId: konu }]);
      if (not) setOnNot(not);
    });
    return () => clearTimeout(t);
  }, [siniflar, konular]);

  // /composer?kutuphane=<id>: kütüphanedeki oyun aynı düzenleyiciyle açılır.
  // /composer?topluluk=<id>: topluluk oyunu kopya olarak açılır (kaydedilince öğretmenin kendi kütüphanesine girer).
  // /composer?okul=<id>: okul kütüphanesindeki oyun aynı biçimde kopya olarak açılır.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("kutuphane");
    const topluluk = params.get("topluluk");
    const okul = params.get("okul");
    if (!id && !topluluk && !okul) return;
    let iptal = false;
    const t = setTimeout(async () => {
      setDurum({ tur: "yukleniyor" });
      const d = id ? await kutuphaneOyunu(id) : okul ? await okulOyunu(okul) : await toplulukOyunu(topluluk!);
      if (iptal) return;
      if (!d || !d.validation) {
        setDurum({
          tur: "hata",
          mesaj: id ? "Kütüphanedeki oyun açılamadı." : okul ? "Okul oyunu açılamadı. Okulunun üyesi olarak giriş yaptığından emin ol." : "Topluluk oyunu açılamadı. Öğretmen olarak giriş yaptığından emin ol.",
          kutuphane: true,
        });
        return;
      }
      setSonuc({ definition: d.oyun.definition, validation: d.validation, dersler: d.oyun.dersler, hedefler: d.hedefler, hedefDersleri: d.hedefDersleri });
      setToplulukKopyasi(!id && !okul);
      setOkulKopyasi(!!okul);
      // Öğretmen puanı yalnız topluluk kaynağına bağlanır; okul kopyası kaynaksızdır.
      setToplulukKaynagi(id || okul ? null : topluluk);
      if (id) {
        setKutuphaneId(id);
        setKutuphaneSurum((d.oyun as { surum?: number }).surum ?? 1);
        setKutuphaneDurumu("kaydedildi");
      }
      setDurum({ tur: "onizleme" });
    });
    return () => {
      iptal = true;
      clearTimeout(t);
    };
  }, []);

  // İlerleme %93'e asimptotik yaklaşır; yanıt gelince %100'e atlar. Üretim 1,5–3 dakika sürebilir.
  useEffect(() => {
    if (durum.tur !== "yukleniyor") return;
    const basla = Date.now();
    const id = setInterval(() => {
      const t = (Date.now() - basla) / 1000;
      setIlerleme(93 * (1 - Math.exp(-t / 70)));
      setMesajNo(Math.max(0, ADIM_SANIYE.findLastIndex((s) => t >= s)));
    }, 250);
    return () => clearInterval(id);
  }, [durum.tur]);

  const ilkKonu = (s: number, d: string) => konular[`${s}:${d}`]?.[0]?.id ?? "";

  // Sınıf değişince bu sınıfta programı olmayan dersler seçimden düşer; kalanların konusu yeni sınıfın ilk konusu olur.
  function sinifSec(s: number) {
    setSinif(s);
    const kalan = secili.filter((k) => konular[`${s}:${k.ders}`]?.length).map((k) => ({ ders: k.ders, konuId: ilkKonu(s, k.ders) }));
    const ilk = dersler.find((d) => konular[`${s}:${d.key}`]?.length);
    setSecili(kalan.length ? kalan : ilk ? [{ ders: ilk.key, konuId: ilkKonu(s, ilk.key) }] : []);
  }

  function dersDegistir(d: string) {
    setSecili((cur) =>
      cur.some((k) => k.ders === d) ? cur.filter((k) => k.ders !== d) : [...cur, { ders: d, konuId: ilkKonu(sinif, d) }]
    );
  }

  function konuSec(d: string, konuId: string) {
    setSecili((cur) => cur.map((k) => (k.ders === d ? { ...k, konuId } : k)));
  }

  const dersAdi = (key: string) => dersler.find((d) => d.key === key)?.ad ?? key;
  const enFazlaDers = maxDersSayisi(sure);
  const cokDers = secili.length > enFazlaDers;
  // Sunucu en az/en çok sınırını normalleştirilmiş metne uygular; düğme de aynı ölçüye bakar.
  const kaynakUzunlugu = kaynakNormal(kaynak).length;
  const gorselli = gorselEtkin && gorsel;
  const maliyet = olusturmaMaliyeti(sure, kaynakUzunlugu > 0) + (gorselli ? KREDI_KURALLARI.gorsel : 0);
  const maliyetEki = [kaynakUzunlugu > 0 && "kaynak", gorselli && "görseller"].filter(Boolean).join(" ve ");
  const hazir = secili.length > 0 && !cokDers && secili.every((k) => k.konuId) && (kaynakUzunlugu === 0 || kaynakUzunlugu >= KAYNAK.enAz);

  async function olustur() {
    setDurum({ tur: "yukleniyor" });
    setIlerleme(0);
    setMesajNo(0);
    const controller = new AbortController();
    istek.current = controller;
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
    try {
      const res = await fetch("/api/compose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sinif,
          dersler: secili,
          sure,
          deneyim,
          alan,
          ...(onNot.trim() ? { serbest_not: onNot.trim() } : {}),
          ...(kaynakUzunlugu > 0 ? { kaynak: kaynak.trim() } : {}),
          ...(gorselli ? { gorsel: true } : {}),
        }),
        signal: controller.signal,
      });
      const json = await res.json().catch(() => ({}));
      // Başarıda harcama, başarısızlıkta iade ya da yetersiz bakiye sonrası güncel bakiye.
      setKredi(json.kredi ?? (await krediDurumuGetir()));
      if (!res.ok) {
        setDurum({ tur: "hata", mesaj: json.error ?? "Oyun şu anda oluşturulamadı. Tekrar deneyin." });
        return;
      }
      setIlerleme(100);
      const yanit = json as ComposeResponse;
      setSonuc({ ...yanit, guvenlikTanimi: yanit.definition });
      aktifGorselIsi.current = yanit.gorselIsi?.isId ?? null;
      setGorselIlerleme(
        yanit.gorselIsi
          ? { hazir: 0, toplam: yanit.gorselIsi.hedefler.length, bitti: false }
          : yanit.gorselNotu
            ? { hazir: 0, toplam: 0, bitti: true, not: yanit.gorselNotu }
            : null
      );
      if (yanit.gorselIsi) gorselleriUret(yanit.gorselIsi.isId, yanit.gorselIsi.hedefler.length);
      setTimeout(() => setDurum({ tur: "onizleme" }), 250);
    } catch {
      setDurum({ tur: "hata", mesaj: "Oyun şu anda oluşturulamadı. Tekrar deneyin." });
    } finally {
      clearTimeout(timer);
    }
  }

  // Hazır görseller tanıma eklenir. Görseller metni değiştirmez: güvenlik denetimi yeni tanım için de geçerli kalır.
  function gorselleriEkle(isId: string, hazir: string[]) {
    const mevcut = sonTanim.current;
    if (aktifGorselIsi.current !== isId || !mevcut || gorselleriBirlestir(mevcut, isId, hazir) === mevcut) return;
    setSonuc((s) => {
      if (!s) return s;
      const def = gorselleriBirlestir(s.definition, isId, hazir);
      return def === s.definition ? s : { ...s, definition: def, ...(s.guvenlikTanimi === s.definition ? { guvenlikTanimi: def } : {}) };
    });
    setKutuphaneDurumu((k) => (k === "kaydedildi" ? "degisti" : k));
  }

  // Her çağrı bir görsel üretir; hedef sayısı kadar paralel çağrılır. Oyun bu sırada kullanılabilir.
  async function gorselleriUret(isId: string, toplam: number) {
    const isle = (d: GorselDurumuYaniti | null) => {
      if (!d || aktifGorselIsi.current !== isId) return;
      setGorselIlerleme((o) => ({
        hazir: Math.max(o?.hazir ?? 0, d.hazir.length),
        toplam: d.toplam,
        bitti: d.bitti,
        ...(d.bitti && d.hazir.length === 0 ? { not: "Görseller üretilemedi; görsel kredin iade edildi. Oyun görselsiz kullanılabilir." } : {}),
      }));
      gorselleriEkle(isId, d.hazir);
    };
    await Promise.all(Array.from({ length: toplam }, async () => isle(await gorselTetikle(isId))));
    let son = await gorselDurumuGetir(isId);
    isle(son);
    // Yarıda kalan (işlev kesilen) hedef bayatlayınca yeniden üretilebilir: bir kez daha denenir.
    if (son && !son.bitti && aktifGorselIsi.current === isId) {
      await new Promise((r) => setTimeout(r, GORSEL_YENIDEN_DENEME_MS));
      const kalan = son.toplam - son.hazir.length - son.hata;
      await Promise.all(Array.from({ length: kalan }, async () => isle(await gorselTetikle(isId))));
      son = await gorselDurumuGetir(isId);
      isle(son);
    }
    if (aktifGorselIsi.current === isId) setKredi(await krediDurumuGetir());
  }

  // Elle düzenlenen tanım istemcide yeniden doğrulanır (sunucu yayında yine doğrular).
  const dogrula = (s: ComposeResponse, def: GameDefinition) =>
    validateGame(def, validationContext({ alan: def.meta.alan, deneyim: def.meta.deneyim, sure: def.meta.sure_dk, ogrenmeCiktilari: s.hedefler, hedefDersleri: s.hedefDersleri }));

  function kaydet(v: Duzenlenen) {
    if (!sonuc) return;
    const def: GameDefinition =
      v.tur === "durak"
        ? { ...sonuc.definition, duraklar: sonuc.definition.duraklar.map((d) => (d.id === v.durak.id ? v.durak : d)) }
        : { ...sonuc.definition, final: v.final };
    setSonuc({ ...sonuc, definition: def, validation: dogrula(sonuc, def) });
    setDuzenlenen(null);
    if (kutuphaneId) setKutuphaneDurumu("degisti");
  }

  // Yapay zekâyla güncelleme (1 kredi). Güncelleme sürerken oyun elle düzenlendiyse düzenleme ezilmez: yalnız
  // güncellenen duraklar mevcut tanıma yerleştirilir (denetim yayında yenilenir).
  async function yzGuncelle(idler: string[], talimat: string): Promise<string | null> {
    if (!sonuc) return "Güncellenecek oyun yok.";
    const gonderilen = sonuc.definition;
    try {
      const res = await fetch("/api/compose/guncelle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ definition: gonderilen, dersler: sonuc.dersler, duraklar: idler, talimat }),
      });
      const json = await res.json().catch(() => ({}));
      setKredi(json.kredi ?? (await krediDurumuGetir()));
      if (!res.ok) return json.error ?? "Oyun şu anda güncellenemedi. Tekrar deneyin.";
      const yeniTanim = json.definition as GameDefinition;
      setSonuc((s) => {
        if (!s) return s;
        if (s.definition === gonderilen) return { ...s, definition: yeniTanim, validation: json.validation, guvenlik: json.guvenlik, guvenlikTanimi: yeniTanim };
        const def = guncellemeyiBirlestir(s.definition, yeniTanim, json.guncellenen as string[]);
        return { ...s, definition: def, validation: dogrula(s, def) };
      });
      if (kutuphaneId) setKutuphaneDurumu("degisti");
      return null;
    } catch {
      setKredi(await krediDurumuGetir());
      return "Oyun güncellenemedi. Bağlantınızı kontrol edin.";
    }
  }

  async function kutuphaneyeEkle() {
    if (!sonuc) return;
    const gonderilen = sonuc.definition;
    setKutuphaneDurumu("kaydediliyor");
    setKutuphaneHatasi("");
    setKutuphaneBilgisi("");
    const r = await kutuphaneyeKaydet(gonderilen, sonuc.dersler, kutuphaneId, kutuphaneId ? kutuphaneSurum : undefined, kutuphaneId ? null : toplulukKaynagi);
    if ("error" in r) {
      setKutuphaneHatasi(r.error);
      setKutuphaneDurumu(kutuphaneId ? "degisti" : "kayitsiz");
      return false;
    }
    setKutuphaneId(r.id);
    window.history.replaceState(null, "", `/composer?kutuphane=${encodeURIComponent(r.id)}`);
    const s = r.surum;
    setKutuphaneSurum(s?.surum ?? 1);
    setKutuphaneBilgisi(
      !s || s.tur === "ayni"
        ? ""
        : s.tur === "surum"
          ? `Sürüm ${s.surum} olarak kaydedildi.`
          : s.neden === "kimlik"
            ? "Oyunun sınıfı, dersi, konusu, alanı, deneyimi ya da süresi değiştiği için yeni bir varyant olarak kaydedildi; özgün oyun kütüphanende yerinde duruyor."
            : `Oyunun %${Math.round(s.oran * 100)}'i değiştiği için yeni bir varyant olarak kaydedildi; özgün oyun kütüphanende yerinde duruyor.`
    );
    const guncel = sonTanim.current === gonderilen;
    setKutuphaneDurumu(guncel ? "kaydedildi" : "degisti");
    if (guncel) setSonuc((s) => (s ? { ...s, validation: r.validation } : s));
    return true;
  }

  async function yayinla() {
    if (!sonuc) return;
    if (kutuphaneId && kutuphaneDurumu === "degisti" && window.confirm("Düzenlemeler kütüphanedeki kayda henüz kaydedilmedi. Yayınlamadan önce kütüphanede de güncellensin mi?")) {
      if (!(await kutuphaneyeEkle())) return;
    }
    setYayinlaniyor(true);
    setYayinHatasi("");
    try {
      const res = await fetch("/api/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ composer: { definition: sonuc.definition, dersler: sonuc.dersler }, ...(kutuphaneId ? { kutuphaneId } : {}) }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.validation) setSonuc({ ...sonuc, validation: json.validation, ...(json.guvenlik && { guvenlik: json.guvenlik, guvenlikTanimi: sonuc.definition }) });
        setYayinHatasi(json.error ?? "Oyun yayınlanamadı. Tekrar deneyin.");
        return;
      }
      const pub = json as PublishResponse;
      saveTeacherGame({ game: pub.game, adminToken: pub.adminToken });
      router.push("/ogretmen");
    } catch {
      setYayinHatasi("Oyun yayınlanamadı. Bağlantınızı kontrol edin.");
    } finally {
      setYayinlaniyor(false);
    }
  }

  const baslik = (
    <header className="bg-indigo-900 text-white px-4 py-4">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <DerseraLogo />
          <p className="text-xs font-semibold text-indigo-200 border-l border-indigo-700 pl-3">{kutuphaneId ? "Kütüphane Oyununu Düzenle" : toplulukKopyasi ? "Topluluk Oyunu (Kopya)" : okulKopyasi ? "Okul Oyunu (Kopya)" : "Yeni Oyun Oluştur"}</p>
        </div>
        <Link href="/ogretmen" className="text-indigo-300 hover:text-white text-sm whitespace-nowrap">
          ← Panel
        </Link>
      </div>
    </header>
  );

  if (ogretmen === false) {
    return (
      <div className="min-h-screen bg-gray-50">
        {baslik}
        <main className="max-w-3xl mx-auto px-4 py-10 text-center">
          <p className="text-gray-700 mb-4">Oyun oluşturmak için öğretmen girişi gerekli.</p>
          <Link href="/ogretmen" className="inline-block bg-indigo-600 text-white font-semibold px-5 py-2.5 rounded-lg">
            Öğretmen girişi
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Demo açıkken arkadaki sayfa odak ve tıklama almaz. */}
      <div inert={demo}>{baslik}</div>
      <main inert={demo} className="max-w-3xl mx-auto px-4 py-6">
        {durum.tur === "form" && (
          <form
            className="space-y-6"
            onSubmit={(e) => {
              e.preventDefault();
              olustur();
            }}
          >
            <div>
              <h1 className="text-xl font-bold text-gray-900">Oyununuzu tanımlayın</h1>
              <p className="text-sm text-gray-500">Üç adımda seçin; gerisini Dersera tasarlar.</p>
            </div>
            <section aria-labelledby="bolum-1" className={BOLUM}>
              <h2 id="bolum-1" className={BOLUM_BASLIK}>
                1. Ders ve Konuyu Seç
              </h2>
              <Secim etiket="Sınıf" secenekler={siniflar.map((s) => ({ key: s, ad: `${s}. sınıf` }))} deger={sinif} onChange={sinifSec} />
              {sinif <= 2 && (
                <p className="text-xs text-gray-600 -mt-3">1. ve 2. sınıfta okuma yeni gelişir: oyun çok kısa metinlerle üretilir; metinleri öğrencilere yüksek sesle okuyabilirsiniz.</p>
              )}
              <fieldset>
                <legend className="text-sm font-semibold text-gray-700 mb-1">Ders</legend>
                <p className="text-xs text-gray-400 mb-2">Birden çok ders seçebilirsiniz; oyun dersleri tek bir hikâyede birleştirir.</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {dersler.filter((d) => konular[`${sinif}:${d.key}`]?.length).map((d) => {
                    const secildi = secili.some((k) => k.ders === d.key);
                    return (
                      <button
                        key={d.key}
                        type="button"
                        aria-pressed={secildi}
                        onClick={() => dersDegistir(d.key)}
                        className={`text-left rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors ${
                          secildi ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-1 ring-indigo-600" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                        }`}
                      >
                        {secildi && <span aria-hidden="true">✓ </span>}
                        {d.ad}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-gray-700 mb-2">Konu</legend>
                {secili.length === 0 && <p className="text-xs text-gray-400">Önce en az bir ders seçin.</p>}
                {secili.map((k) => (
                  <label key={k.ders} className="block">
                    {secili.length > 1 && <span className="block text-xs font-semibold text-gray-500 mb-1">{dersAdi(k.ders)}</span>}
                    <select
                      aria-label={`${dersAdi(k.ders)} konusu`}
                      value={k.konuId}
                      onChange={(e) => konuSec(k.ders, e.target.value)}
                      className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm bg-white"
                    >
                      {(konular[`${sinif}:${k.ders}`] ?? []).map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.ad}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              <KaynakGirdisi deger={kaynak} onChange={setKaynak} />
            </section>
            <section aria-labelledby="bolum-2" className={BOLUM}>
              <h2 id="bolum-2" className={BOLUM_BASLIK}>
                2. Oyunun Tarzını Seç
              </h2>
              <Secim etiket="Süre" secenekler={[20, 40, 60].map((s) => ({ key: s as 20 | 40 | 60, ad: `${s} dk` }))} deger={sure} onChange={setSure} />
              {cokDers && (
                <p role="alert" className="text-sm text-red-600 -mt-3">
                  {sure} dakikalık oyunda en fazla {enFazlaDers} ders seçilebilir. Ders sayısını azaltın ya da süreyi uzatın.
                </p>
              )}
              <Secim etiket="Deneyim biçimi" secenekler={[...DENEYIM_SECENEKLERI]} deger={deneyim} onChange={setDeneyim} />
              <Secim etiket="Oyun alanı" secenekler={[...ALAN_SECENEKLERI]} deger={alan} onChange={setAlan} />
              {gorselEtkin && (
                <label className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 cursor-pointer ${gorsel ? "border-indigo-600 bg-indigo-50" : "border-gray-200 bg-white"}`}>
                  <input type="checkbox" checked={gorsel} onChange={(e) => setGorsel(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" aria-describedby="gorsel-aciklama" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-800">
                      <span aria-hidden="true">🎨 </span>Görsellerle zenginleştir <span className="font-normal text-gray-500">(+{KREDI_KURALLARI.gorsel} kredi)</span>
                    </span>
                    <span id="gorsel-aciklama" className="block text-xs text-gray-500 mt-0.5">
                      Kapak ve 3 ana sahne için çizim üretilir. Oyun beklemeden hazır olur; görseller birkaç dakika içinde eklenir. Hiç görsel üretilemezse kredin iade edilir.
                    </span>
                  </span>
                </label>
              )}
              <div>
                <label htmlFor="on-not" className="text-sm font-semibold text-gray-700 mb-2 block">
                  Ön Not <span className="font-normal text-gray-500">(isteğe bağlı)</span>
                </label>
                <textarea
                  id="on-not"
                  value={onNot}
                  onChange={(e) => setOnNot(e.target.value.slice(0, SERBEST_NOT_MAX))}
                  maxLength={SERBEST_NOT_MAX}
                  rows={3}
                  aria-describedby="on-not-aciklama"
                  placeholder="Örn: Okul laboratuvarında bir kaza olsun, öğrenciler QR ile kanıt toplasın..."
                  className="w-full border border-gray-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-gray-500 mt-1 flex justify-between gap-3">
                  <span id="on-not-aciklama">Kafandaki mekân, sahne, karakter ya da kurgu fikrini yaz; oyun bu çerçevede kurulur.</span>
                  {/* Sayaç ekran okuyucuya yalnız sınıra yaklaşınca okunur; her tuşta okunması gürültü olur. */}
                  <span aria-live={onNot.length >= SERBEST_NOT_MAX - 50 ? "polite" : "off"} className="shrink-0">
                    {onNot.length}/{SERBEST_NOT_MAX}
                  </span>
                </p>
              </div>
            </section>
            <section aria-labelledby="bolum-3" className={BOLUM}>
              <h2 id="bolum-3" className={BOLUM_BASLIK}>
                3. Kontrol Et ve Oluştur
              </h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-gray-500">Sınıf</dt>
                <dd className="text-gray-900">{sinif}. sınıf</dd>
                <dt className="text-gray-500">Ders ve konu</dt>
                <dd className="text-gray-900">
                  {secili.length === 0
                    ? "—"
                    : secili.map((k) => `${dersAdi(k.ders)}: ${(konular[`${sinif}:${k.ders}`] ?? []).find((u) => u.id === k.konuId)?.ad ?? "—"}`).join(" · ")}
                </dd>
                <dt className="text-gray-500">Tarz</dt>
                <dd className="text-gray-900">
                  {sure} dk · {DENEYIM_SECENEKLERI.find((d) => d.key === deneyim)?.ad} · {ALAN_SECENEKLERI.find((a) => a.key === alan)?.ad}
                  {onNot.trim() && " · Ön not var"}
                </dd>
                <dt className="text-gray-500">Kaynak</dt>
                <dd className="text-gray-900">{kaynakUzunlugu > 0 ? `Öğretmen kaynağı (${kaynakUzunlugu.toLocaleString("tr-TR")} karakter)` : "Yok (müfredattan)"}</dd>
                {gorselli && (
                  <>
                    <dt className="text-gray-500">Görseller</dt>
                    <dd className="text-gray-900">Kapak + 3 sahne (oyun oluştuktan sonra eklenir)</dd>
                  </>
                )}
                <dt className="text-gray-500">Kredi</dt>
                <dd className={kredi && kredi.toplam < maliyet ? "text-red-700" : "text-gray-900"}>
                  <span role="status">
                    Bu oyun <strong>{maliyet} kredi</strong>
                    {maliyetEki && ` (${maliyetEki} dahil)`}
                    {kredi && <> · Bakiyen: {krediMetni(kredi)}</>}
                    {kredi && kredi.toplam < maliyet && ". Bakiyen yetmiyor; aylık hakkın ay başında yenilenir."}
                  </span>
                </dd>
              </dl>
              <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl p-3">
                <span aria-hidden="true">🛡 </span>
                Oyunun taslağını yapay zekâ hazırlar; müfredat uyumu, oyun mantığı, öğrenme kalitesi ve çocuk güvenliği açısından otomatik olarak denetlenir.
                Sonucu önizlemede görür, gerekirse düzenlersin; yayından önce son onay senindir. Engelleyen içerik yayınlanamaz. Oyun oluşturulamazsa kredin
                iade edilir.
              </p>
              <button
                type="submit"
                disabled={!hazir || ogretmen !== true || (!!kredi && kredi.toplam < maliyet)}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white font-bold py-3.5 rounded-xl text-base"
              >
                Oyunu Oluştur
              </button>
            </section>
          </form>
        )}

        {durum.tur === "yukleniyor" && <Yukleniyor ilerleme={ilerleme} adim={mesajNo} />}

        {durum.tur === "hata" && (
          <div className="py-12 text-center" role="alert">
            <div className="text-4xl mb-3" aria-hidden="true">
              ⚠️
            </div>
            <p className="font-semibold text-gray-900">{durum.mesaj}</p>
            <div className="flex gap-2 justify-center mt-5">
              <button
                onClick={() => {
                  if (durum.kutuphane) window.history.replaceState(null, "", "/composer");
                  setDurum({ tur: "form" });
                }}
                className="border border-gray-300 text-gray-700 font-semibold px-4 py-2 rounded-lg"
              >
                Seçimlere dön
              </button>
              <button onClick={durum.kutuphane ? () => window.location.reload() : olustur} className="bg-indigo-600 text-white font-semibold px-4 py-2 rounded-lg">
                Tekrar dene
              </button>
            </div>
          </div>
        )}

        {durum.tur === "onizleme" && sonuc && (
          <ComposerPreview
            definition={sonuc.definition}
            validation={sonuc.validation}
            guvenlik={sonuc.guvenlik && sonuc.guvenlikTanimi === sonuc.definition ? sonuc.guvenlik : { durum: "bekliyor" }}
            hedefler={sonuc.hedefler}
            onEdit={setDuzenlenen}
            onDemo={() => setDemo(true)}
            onPublish={yayinla}
            onNew={() => {
              aktifGorselIsi.current = null;
              setGorselIlerleme(null);
              setSonuc(null);
              setKutuphaneId(null);
              setKutuphaneDurumu("kayitsiz");
              setKutuphaneHatasi("");
              setKutuphaneBilgisi("");
              setKutuphaneSurum(undefined);
              setToplulukKopyasi(false);
              setOkulKopyasi(false);
              setToplulukKaynagi(null);
              window.history.replaceState(null, "", "/composer");
              setDurum({ tur: "form" });
            }}
            kutuphane={{ durum: kutuphaneDurumu, hata: kutuphaneHatasi, bilgi: kutuphaneBilgisi, onSave: kutuphaneyeEkle }}
            guncelleme={ogretmen ? { kredi, onGuncelle: yzGuncelle } : undefined}
            gorsel={gorselIlerleme}
            publishing={yayinlaniyor}
            publishError={yayinHatasi}
          />
        )}
      </main>
      {duzenlenen && <DurakEditor value={duzenlenen} onSave={kaydet} onClose={() => setDuzenlenen(null)} />}
      {demo && sonuc && (
        <div role="dialog" aria-modal="true" aria-label="Öğrenci gözüyle demo" className="fixed inset-0 z-50 overflow-y-auto">
          <OgrenciDemo def={sonuc.definition} onCik={() => setDemo(false)} />
        </div>
      )}
    </div>
  );
}
