import type { TDocumentDefinitions, Content } from "pdfmake/interfaces";

export type InvoicePosition = {
  title: string;
  details: string;
  vatRate: number;
  unitPrice: number;
};

export type InvoiceData = {
  receiverName: string;
  receiverStreet: string;
  receiverCityLine: string;
  receiverCountry: string;
  receiverUid?: string;
  invoiceNumber: string;
  date: Date;
  positions: InvoicePosition[];
};

const MONTHS_DE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function fmtDateShort(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getFullYear()}`;
}

function fmtDateLong(d: Date): string {
  return `${d.getDate()}. ${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtMonth(d: Date): string {
  return `${MONTHS_DE[d.getMonth()]} ${d.getFullYear()}`;
}

function fmtMoney(n: number): string {
  return n.toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function buildInvoiceDocDefinition(data: InvoiceData): TDocumentDefinitions {
  const dueDate = new Date(data.date);
  dueDate.setDate(dueDate.getDate() + 14);

  const netSum = data.positions.reduce((s, p) => s + p.unitPrice, 0);
  const vatGrouped = new Map<number, number>();
  for (const p of data.positions) {
    vatGrouped.set(p.vatRate, (vatGrouped.get(p.vatRate) ?? 0) + p.unitPrice * (p.vatRate / 100));
  }
  const vatSum = Array.from(vatGrouped.values()).reduce((s, v) => s + v, 0);
  const total = netSum + vatSum;

  const tableBody: Content[][] = [
    [
      { text: "Pos", style: "thLeft" },
      { text: "Bezeichnung", style: "thLeft" },
      { text: "USt.", style: "thRight" },
      { text: "Einzelpreis", style: "thRight" },
      { text: "Netto", style: "thRight" },
    ],
    ...data.positions.map((p, i) => [
      { text: String(i + 1), style: "tdLeft" },
      {
        stack: [
          { text: p.title, bold: true, fontSize: 9.5 },
          ...(p.details
            ? [{ text: p.details, fontSize: 9, color: "#3a3a3a", margin: [0, 2, 0, 0] as [number, number, number, number] }]
            : []),
        ],
      },
      { text: `${p.vatRate} %`, style: "tdRight" },
      { text: `${fmtMoney(p.unitPrice)} €`, style: "tdRight" },
      { text: `${fmtMoney(p.unitPrice)} €`, style: "tdRight" },
    ]),
  ];

  const vatLines: Content[] = Array.from(vatGrouped.entries()).map(([rate, amount]) => ({
    columns: [
      { text: `zzgl. ${rate}% USt.`, alignment: "right", fontSize: 10 },
      { text: fmtMoney(amount), alignment: "right", width: 70, fontSize: 10 },
    ],
    margin: [0, 4, 0, 0],
  }));

  return {
    pageSize: "A4",
    pageMargins: [50, 50, 50, 110],

    content: [
      /* ── HEADER ─────────────────────────────────────── */
      {
        columns: [
          { text: "", width: "*" },
          {
            width: "auto",
            stack: [
              { text: "HANGO", fontSize: 48, bold: true, alignment: "right" },
              { text: "Hanxiang Lee  ·  Marketing & Web Agentur", fontSize: 10, bold: true, alignment: "right", margin: [0, 8, 0, 0] },
              { text: "Wien, Österreich", fontSize: 10, alignment: "right" },
              { text: "business@hango.at  |  hango.at", fontSize: 10, alignment: "right" },
              { text: "UID-Nr.: ATU81775624", fontSize: 10, alignment: "right" },
            ],
          },
        ],
      },

      { text: "", margin: [0, 18, 0, 0] },

      /* ── SENDER LINE (faded) ────────────────────────── */
      {
        text: "Hanxiang Lee  ·  Marketing & Web Agentur  ·  Wien, Österreich",
        fontSize: 8.5,
        color: "#8a8a8a",
        margin: [0, 0, 0, 4],
      },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }] },

      /* ── RECEIVER ───────────────────────────────────── */
      {
        margin: [0, 10, 0, 0],
        stack: [
          { text: data.receiverName, bold: true, fontSize: 11 },
          { text: data.receiverStreet, fontSize: 10 },
          { text: `${data.receiverCityLine}${data.receiverCountry ? `, ${data.receiverCountry}` : ""}`, fontSize: 10 },
          ...(data.receiverUid && data.receiverUid.trim()
            ? [{ text: `UID-Nr.: ${data.receiverUid.trim()}`, fontSize: 10, margin: [0, 3, 0, 0] as [number, number, number, number] }]
            : []),
        ],
      },

      /* ── TITLE + DATE ───────────────────────────────── */
      {
        margin: [0, 30, 0, 0],
        columns: [
          { text: "Rechnung", fontSize: 24, bold: true, width: "*" },
          {
            width: "auto",
            text: `Datum: ${fmtDateShort(data.date)}`,
            fontSize: 10,
            bold: true,
            alignment: "right",
            margin: [0, 14, 0, 0],
          },
        ],
      },

      /* ── META ───────────────────────────────────────── */
      {
        margin: [0, 20, 0, 0],
        stack: [
          {
            text: [
              { text: "Rechnungsnummer: ", bold: true },
              { text: data.invoiceNumber },
            ],
            fontSize: 10,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Leistungszeitraum: ", bold: true },
              { text: fmtMonth(data.date) },
            ],
            fontSize: 10,
            margin: [0, 0, 0, 3],
          },
          {
            text: [
              { text: "Fälligkeitsdatum: ", bold: true },
              { text: `${fmtDateLong(dueDate)} (14 Tage netto)` },
            ],
            fontSize: 10,
          },
        ],
      },

      /* ── POSITIONS TABLE ────────────────────────────── */
      {
        margin: [0, 22, 0, 0],
        table: {
          headerRows: 1,
          widths: [25, "*", 35, 60, 55],
          body: tableBody,
        },
        layout: {
          fillColor: (rowIndex: number) => (rowIndex === 0 ? "#f3f3f3" : null),
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#cccccc",
          vLineColor: () => "#cccccc",
          paddingTop: () => 7,
          paddingBottom: () => 7,
          paddingLeft: () => 7,
          paddingRight: () => 7,
        },
      },

      /* ── TOTALS ─────────────────────────────────────── */
      {
        margin: [0, 18, 0, 0],
        columns: [
          { text: "", width: "*" },
          {
            width: 200,
            stack: [
              {
                columns: [
                  { text: "Netto", alignment: "right", fontSize: 10 },
                  { text: fmtMoney(netSum), alignment: "right", width: 70, fontSize: 10 },
                ],
              },
              ...vatLines,
              { canvas: [{ type: "line", x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }], margin: [0, 6, 0, 0] },
              {
                columns: [
                  { text: "Gesamt EUR", alignment: "right", bold: true, fontSize: 11 },
                  { text: fmtMoney(total), alignment: "right", width: 70, bold: true, fontSize: 11 },
                ],
                margin: [0, 6, 0, 0],
              },
            ],
          },
        ],
      },

      /* ── PAYMENT INFO ───────────────────────────────── */
      {
        margin: [0, 28, 0, 0],
        text: `Der Betrag wird gebeten bis zum ${fmtDateLong(dueDate)} auf folgendes Konto zu überweisen:`,
        fontSize: 10,
      },
      {
        margin: [0, 8, 0, 0],
        fontSize: 10,
        stack: [
          { text: [{ text: "Kontoinhaber: ", bold: true }, "Hanxiang Lee"] },
          { text: [{ text: "IBAN: ", bold: true }, "AT28 2011 1842 3371 5200"] },
          { text: [{ text: "BIC: ", bold: true }, "GIBAATWWXXX"] },
          { text: [{ text: "Bank: ", bold: true }, "Erste Bank"] },
          {
            text: [
              { text: "Verwendungszweck: ", bold: true },
              `RE ${data.invoiceNumber} – ${data.receiverName}`,
            ],
          },
        ],
      },

      {
        margin: [0, 22, 0, 0],
        text: "Vielen Dank für Ihr Vertrauen – wir freuen uns auf die Zusammenarbeit!",
        fontSize: 10,
      },
    ],

    /* ── FOOTER ───────────────────────────────────────── */
    footer: () => ({
      margin: [50, 20, 50, 0],
      stack: [
        { canvas: [{ type: "line", x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: "#cccccc" }] },
        {
          margin: [0, 10, 0, 0],
          fontSize: 8,
          columns: [
            {
              stack: [
                { text: "Hanxiang Lee", bold: true },
                { text: "Marketing & Web Agentur" },
                { text: "Wien, Österreich" },
              ],
            },
            {
              stack: [
                { text: "business@hango.at", bold: true },
                { text: "www.hango.at" },
              ],
            },
            {
              stack: [{ text: "UID-Nr.: ATU81775624", bold: true }],
            },
            {
              stack: [
                { text: "Erste Bank", bold: true },
                { text: "IBAN: AT28 2011 1842 3371 5200" },
                { text: "BIC: GIBAATWWXXX" },
              ],
            },
          ],
        },
      ],
    }),

    styles: {
      thLeft: { bold: true, fontSize: 9.5, alignment: "left" },
      thRight: { bold: true, fontSize: 9.5, alignment: "right" },
      tdLeft: { fontSize: 9.5, alignment: "left" },
      tdRight: { fontSize: 9.5, alignment: "right" },
    },

    defaultStyle: {
      font: "Roboto",
      color: "#1a1a1a",
    },
  };
}

export async function generateInvoicePdf(data: InvoiceData): Promise<void> {
  const pdfMakeMod = await import("pdfmake/build/pdfmake");
  const vfsMod = await import("pdfmake/build/vfs_fonts");

  const pdfMake = (pdfMakeMod as unknown as { default?: typeof pdfMakeMod }).default ?? pdfMakeMod;
  const vfsRaw = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod;
  const vfs =
    (vfsRaw as { pdfMake?: { vfs: Record<string, string> } }).pdfMake?.vfs ??
    (vfsRaw as { vfs?: Record<string, string> }).vfs ??
    (vfsRaw as Record<string, string>);

  (pdfMake as unknown as { addVirtualFileSystem: (v: Record<string, string>) => void }).addVirtualFileSystem(vfs);

  const docDef = buildInvoiceDocDefinition(data);
  const filename = `RE-${data.invoiceNumber}-${data.receiverName.replace(/[^a-zA-Z0-9]+/g, "-")}.pdf`;
  (pdfMake as unknown as { createPdf: (d: TDocumentDefinitions) => { download: (n: string) => void } })
    .createPdf(docDef)
    .download(filename);
}
