import { CARD, QR_DESIGNS, darkRuns, qrLayout, type QrDesignId } from "@/lib/qr";

export default function QrCard({ n, design }: { n: number; design: QrDesignId }) {
  const d = QR_DESIGNS[design];
  const layout = qrLayout(n);
  const path = darkRuns(layout)
    .map((r) => `M${r.col * layout.cell} ${r.row * layout.cell}h${r.length * layout.cell}v${layout.cell}h${-r.length * layout.cell}z`)
    .join("");

  return (
    <svg
      role="img"
      aria-label={`Durak ${n} QR kodu (${d.label})`}
      width={CARD.width}
      height={CARD.height}
      viewBox={`0 0 ${CARD.width} ${CARD.height}`}
      xmlns="http://www.w3.org/2000/svg"
      className="block shrink-0"
    >
      <defs>
        <clipPath id={`card-${design}-${n}`}>
          <rect width={CARD.width} height={CARD.height} rx={CARD.radius} />
        </clipPath>
      </defs>
      <g clipPath={`url(#card-${design}-${n})`}>
        <rect width={CARD.width} height={CARD.height} fill={d.background} />
        {d.band && <rect width={CARD.width} height={CARD.bandHeight} fill={d.band} />}
      </g>
      {d.border && (
        <rect x={0.5} y={0.5} width={CARD.width - 1} height={CARD.height - 1} rx={CARD.radius - 0.5} fill="none" stroke={d.border} />
      )}
      <text
        x={CARD.width / 2}
        y={CARD.brandY}
        textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight={700}
        fontSize={11}
        letterSpacing={1.5}
        fill={d.brand}
      >
        DERSERA
      </text>
      <g transform={`translate(${CARD.qrX} ${CARD.qrY})`}>
        <path d={path} fill={d.modules} shapeRendering="crispEdges" />
        <text
          x={CARD.qrSize / 2}
          y={CARD.qrSize / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="Helvetica, Arial, sans-serif"
          fontWeight={700}
          fontSize={CARD.numberSize}
          fill={d.number}
        >
          {n}
        </text>
      </g>
      <text
        x={CARD.width / 2}
        y={CARD.footerY}
        textAnchor="middle"
        fontFamily="Helvetica, Arial, sans-serif"
        fontSize={8}
        fill={d.footer}
      >
        dersera.vercel.app
      </text>
    </svg>
  );
}
