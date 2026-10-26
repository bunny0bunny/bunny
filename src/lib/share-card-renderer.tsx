import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { FORMAT_LABELS, type Format } from "./constants";
import { shareCardGenres, type ShareCardData } from "./share-card-data";

const size = { width: 1200, height: 630 };
const FORMAT_AR: Record<string, string> = FORMAT_LABELS;

async function loadFonts() {
  const dir = path.join(process.cwd(), "public", "fonts");
  async function loadFont(name: string) {
    return readFile(path.join(dir, name));
  }
  const [arabicRegular, arabicBold, latinRegular, latinBold] = await Promise.all([
    loadFont("ibm-plex-sans-arabic-arabic-400-normal.woff"),
    loadFont("ibm-plex-sans-arabic-arabic-700-normal.woff"),
    loadFont("ibm-plex-sans-arabic-latin-400-normal.woff"),
    loadFont("ibm-plex-sans-arabic-latin-700-normal.woff"),
  ]);
  return [
    { name: "BunnyArabic", data: arabicRegular, weight: 400 as const, style: "normal" as const },
    { name: "BunnyArabic", data: arabicBold, weight: 700 as const, style: "normal" as const },
    { name: "BunnyArabic", data: latinRegular, weight: 400 as const, style: "normal" as const },
    { name: "BunnyArabic", data: latinBold, weight: 700 as const, style: "normal" as const },
  ];
}

/**
 * satori lays text runs LTR and ignores the CSS `direction` property, so
 * Arabic word ORDER comes out reversed (glyph shaping within words is
 * correct — spaces break joining anyway). Feeding the words in reverse
 * makes the visual result read correctly right-to-left. Only safe on
 * pure-Arabic strings — never apply to runs containing Latin/digits.
 */
function ar(s: string): string {
  if (/[A-Za-z0-9]/.test(s)) return s;
  return s.split(" ").reverse().join(" ");
}

export async function renderShareCard(s: ShareCardData | null) {
  const fonts = await loadFonts();

  const title = s?.titleAr ?? "مكتبة بانيورا";
  const author = s?.author ?? "منصة القراءة العربية";
  const accent = s?.accent ?? "#9B7BFF";
  const format = s ? (FORMAT_AR[s.format as Format] ?? "عمل") : "اقرأ على مهلك";
  const genres = s ? shareCardGenres(s.genresJson) : [];
  const rating = s && s.ratingCount > 0 ? s.ratingAvg.toFixed(1) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          position: "relative",
          backgroundColor: "#0B0B10",
          color: "#F2F0FA",
          fontFamily: "BunnyArabic",
        }}
      >
        {/* accent glow + edge stripe */}
        <div
          style={{
            position: "absolute",
            top: -180,
            left: -140,
            width: 560,
            height: 560,
            borderRadius: 9999,
            backgroundColor: accent,
            opacity: 0.22,
            filter: "blur(80px)",
            display: "flex",
          }}
        />
        <div style={{ position: "absolute", top: 0, right: 0, width: 10, height: "100%", backgroundColor: accent, display: "flex" }} />
        <div
          style={{
            position: "absolute",
            bottom: -120,
            right: 120,
            fontSize: 380,
            fontWeight: 700,
            color: accent,
            opacity: 0.09,
            display: "flex",
          }}
        >
          ب
        </div>

        {/* brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexDirection: "row-reverse" }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              backgroundColor: "rgba(155,123,255,0.16)",
              border: "1px solid rgba(155,123,255,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 30,
              fontWeight: 700,
              color: "#9B7BFF",
            }}
          >
            ب
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <span style={{ fontSize: 26, fontWeight: 700 }}>{ar("مكتبة بانيورا")}</span>
            <span style={{ fontSize: 15, color: "#8B87A0" }}>Bunyora Library</span>
          </div>
        </div>

        {/* title block */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 940 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexDirection: "row-reverse" }}>
            <span
              style={{
                fontSize: 22,
                fontWeight: 700,
                color: "#0B0B10",
                backgroundColor: accent,
                padding: "6px 18px",
                borderRadius: 9999,
              }}
            >
              {format}
            </span>
            {genres.map((g) => (
              <span
                key={g}
                style={{
                  fontSize: 20,
                  color: "#B9B4CC",
                  border: "1px solid rgba(255,255,255,0.18)",
                  padding: "5px 16px",
                  borderRadius: 9999,
                }}
              >
                {g}
              </span>
            ))}
          </div>
          <div style={{ fontSize: title.length > 28 ? 76 : 92, fontWeight: 700, lineHeight: 1.25 }}>{ar(title)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, fontSize: 28, color: "#A9A4BD", flexDirection: "row-reverse" }}>
            <span>{ar(`تأليف: ${author}`)}</span>
            {rating && (
              <span style={{ display: "flex", color: "#DDBB77", fontWeight: 700 }}>{`${rating} / 5`}</span>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexDirection: "row-reverse" }}>
          <span style={{ fontSize: 22, color: "#6F6A85" }}>{ar("مكتبة بانيورا")}</span>
          <span style={{ fontSize: 22, color: "#6F6A85" }}>{ar("اقرأ على مهلك — بلا إعلانات")}</span>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
