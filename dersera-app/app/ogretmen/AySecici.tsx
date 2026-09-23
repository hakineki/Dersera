import { AYLAR, CORE_DERSLER, DERS_ADI, sinif10 } from "@/data/mufredat";

export default function AySecici({
  selectedAylar,
  toggleAy,
}: {
  selectedAylar: string[];
  toggleAy: (slug: string) => void;
}) {
  const seciliAyPlan = sinif10[AYLAR.findIndex((a) => a.ay === selectedAylar[0])];

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
      <p className="text-sm font-semibold text-gray-700 mb-3">
        📅 Dönem Seç — seçilen ayların sorularından havuz oluşturulur
      </p>
      <div className="flex flex-wrap gap-2">
        {AYLAR.map((a) => (
          <button
            key={a.ay}
            type="button"
            aria-pressed={selectedAylar.includes(a.ay)}
            onClick={() => toggleAy(a.ay)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              selectedAylar.includes(a.ay) ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {a.ad}
          </button>
        ))}
      </div>
      {seciliAyPlan && (
        <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CORE_DERSLER.map((ders) => (
            <div key={ders} className="text-xs text-gray-500">
              <span className="font-semibold text-gray-700">{DERS_ADI[ders]}:</span>{" "}
              {seciliAyPlan.dersler[ders]?.ad ?? "—"}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
