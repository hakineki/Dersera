// Vercel Blob iki yolla bağlanır: eski depolarda okuma-yazma belirteci (BLOB_READ_WRITE_TOKEN); yeni depolarda belirteç
// verilmez, BLOB_STORE_ID ve projenin OIDC kimliği kullanılır (Vercel çalışma anında VERCEL_OIDC_TOKEN sağlar; projede
// Settings → Security → OIDC Federation açık olmalı). @vercel/blob ikisini de kendisi çözer (önce OIDC + depo kimliği,
// yoksa belirteç). Biri tanımlıysa depo yapılandırılmış sayılır; değerler hiçbir yerde okunmaz ya da gösterilmez.
export const BLOB_DEGISKENLERI = ["BLOB_STORE_ID", "BLOB_READ_WRITE_TOKEN"] as const;

export const blobTanimli = (env: Record<string, string | undefined> = process.env): boolean => BLOB_DEGISKENLERI.some((a) => !!env[a]?.trim());

export const BLOB_EKSIK = "Blob deposu bağlı değil (BLOB_STORE_ID ya da BLOB_READ_WRITE_TOKEN tanımlı değil)";
