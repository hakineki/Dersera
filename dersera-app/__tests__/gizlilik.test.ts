import { OTURUM_CEREZI, OTURUM_SURESI_MS } from "@/lib/auth";
import { KOPYA_SAKLAMA } from "@/lib/denetimKaydi";
import { GAME_RETENTION_MS } from "@/lib/gamesStore";
import { GIZLILIK_BOLUMLERI, GIZLILIK_SURUMU, VERI_SORUMLUSU } from "@/lib/gizlilik";
import { KATILIM_SAKLAMA_MS } from "@/lib/istatistikService";
import { HAREKET_SAKLAMA } from "@/lib/krediStore";
import { MODERASYON } from "@/lib/moderasyon";
import { OGRENME } from "@/lib/ogrenme";
import { TABLO_TTL_MS } from "@/lib/ogrenmeTakibiStore";
import { RESULTS_RETENTION_MS } from "@/lib/resultsStore";
import { YEDEK_SAKLAMA_GUN } from "@/lib/yedekDepo";
import { ISLEM_SAKLAMA } from "@/lib/yonetimIslemKaydi";

// Aydınlatma metni koddaki gerçek saklama süreleri ve çerezle aynı kalmalı: süre değişirse bu test metni güncellemeyi hatırlatır.
const GUN = 24 * 60 * 60 * 1000;
const metin = GIZLILIK_BOLUMLERI.map((b) => [b.baslik, b.metin ?? "", ...(b.liste ?? [])].join("\n")).join("\n");
const bolum = (baslik: string) => {
  const b = GIZLILIK_BOLUMLERI.find((x) => x.baslik === baslik);
  if (!b) throw new Error(baslik);
  return [b.metin ?? "", ...(b.liste ?? [])].join("\n");
};

describe("gizlilik ve KVKK aydınlatma metni", () => {
  it("KVKK md. 10'un istediği bölümler var: veri sorumlusu, amaç ve hukuki sebep, aktarım, toplama yöntemi, haklar", () => {
    expect(GIZLILIK_BOLUMLERI.map((b) => b.baslik)).toEqual(
      expect.arrayContaining(["Veri sorumlusu", "Hangi verileri işliyoruz", "Amaçlar ve hukuki sebepler", "Toplama yöntemi", "Kimlere ve nereye aktarılıyor", "Saklama süreleri", "Hakların"])
    );
    expect(bolum("Veri sorumlusu")).toContain(VERI_SORUMLUSU.ad);
    expect(bolum("Veri sorumlusu")).toContain(VERI_SORUMLUSU.eposta);
    expect(bolum("Hakların")).toContain(VERI_SORUMLUSU.eposta);
    expect(bolum("Hakların")).toMatch(/md\. 11/);
    expect(bolum("Hakların")).toMatch(/md\. 14/);
    expect(bolum("Kimlere ve nereye aktarılıyor")).toMatch(/md\. 9/);
    expect(GIZLILIK_SURUMU).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("saklama süreleri koddakiyle aynı", () => {
    const s = bolum("Saklama süreleri");
    expect(RESULTS_RETENTION_MS / GUN).toBe(7);
    expect(KATILIM_SAKLAMA_MS / GUN).toBe(7);
    expect(s).toContain("Öğrenci sonuçları ve istatistikteki öğrenci özeti: 7 gün");
    expect(s).toContain(`aylık sayaçları: ${TABLO_TTL_MS / GUN} gün`);
    expect(s).toContain(`son ${OGRENME.talimatSaklama} talimat`);
    expect(GAME_RETENTION_MS / GUN).toBe(1);
    expect(s).toContain("bitiminden 1 gün sonra");
    expect(s).toContain(`Oturum: ${OTURUM_SURESI_MS / GUN} gün`);
    expect(s).toContain(`Moderasyon kayıtları: ${MODERASYON.saklamaGun} gün`);
    expect(s).toContain(`son ${HAREKET_SAKLAMA} hareket`);
    expect(s).toContain(`son ${KOPYA_SAKLAMA.toLocaleString("tr-TR")} kayıt`);
    expect(s).toContain(`Şifreli gece yedeği: ${YEDEK_SAKLAMA_GUN} gün`);
    expect(s).toContain(`Yönetim işlem kaydı: son ${ISLEM_SAKLAMA} işlem`);
    expect(s).toContain("Askı kaydı ve gerekçesi: hesap silinene kadar");
    expect(s).toMatch(/okul kapatılınca okul kaydı, davet kodu, üyelikler, okul kütüphanesindeki paylaşımlar ve okulun kredi havuzu silinir/);
    expect(bolum("Hangi verileri işliyoruz")).toMatch(/Hesap yönetimi: .*askıya/);
  });

  it("tek çerez oturum çerezidir; süresi koddakiyle aynı; takip çerezi yok", () => {
    const c = bolum("Çerezler ve tarayıcıda saklanan bilgiler");
    expect(c).toContain(`${OTURUM_CEREZI}, ${OTURUM_SURESI_MS / GUN} gün`);
    expect(c).toMatch(/takip çerezi .*yoktur/);
  });

  it("öğrenciden kimlik bilgisi istenmediğini ve öğrenci verisinin yapay zekâya gitmediğini söyler", () => {
    expect(metin).toContain("Öğrenciden ad-soyad");
    expect(metin).toContain("Öğrenci takma adları ve sonuçları yapay zekâ hizmetine gönderilmez");
  });
});
