import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const d = await req.json();

  const fmt = (n: number) => (n ?? 0).toFixed(2).replace(".", ",") + " €";

  const tourRows = d.tours.map((t: any) => `
    <tr>
      <td>${t.date}</td>
      <td>${t.tourLabel}</td>
      <td style="text-align:center">${t.paxCount ?? "–"}</td>
      <td style="text-align:right">${fmt(t.honorarNet)}</td>
    </tr>
  `).join("");

  const auslagenRows = d.tours
    .filter((t: any) => (t.mvvGross ?? 0) > 0)
    .map((t: any) => {
      const pos = [];
      if (t.mvvSingleTickets > 0) pos.push(`${t.mvvSingleTickets}x Einzelkarte`);
      if (t.mvvGroupTickets > 0) pos.push(`${t.mvvGroupTickets}x Gruppenkarte`);
      return `
        <tr>
          <td>${t.date}</td>
          <td>${t.tourLabel}</td>
          <td>${pos.join(", ")}</td>
          <td style="text-align:right">${fmt(t.mvvGross)}</td>
          <td style="text-align:right">${fmt(t.mvvGross / 1.07)}</td>
        </tr>
      `;
    }).join("");

  const bargeldRows = d.tours
    .filter((t: any) => (t.cashCount ?? 0) > 0)
    .map((t: any) => `
      <tr>
        <td>${t.date}</td>
        <td>${t.tourLabel}</td>
        <td style="text-align:right">${fmt(t.cashCount)}</td>
      </tr>
    `).join("");

  const reviewRows = (d.reviews?.items ?? []).map((r: any) => `
    <tr>
      <td>${r.date}</td>
      <td>${r.tourLabel}</td>
      <td style="text-align:center">${r.fiveStarReviews} ★</td>
      <td style="text-align:right">${fmt(r.reviewBonus)}</td>
    </tr>
  `).join("");

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #222; margin: 40px; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  h2 { font-size: 14px; margin: 24px 0 8px; border-bottom: 2px solid #333; padding-bottom: 4px; }
  .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
  .sender { font-size: 11px; color: #888; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  th { background: #f0f0f0; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #eee; font-size: 12px; }
  .sum-row td { border-top: 2px solid #ccc; font-weight: bold; border-bottom: none; }
  .totals { margin-top: 24px; }
  .totals table { width: auto; min-width: 300px; float: right; }
  .totals td { border: none; padding: 3px 8px; }
  .totals td:first-child { text-align: left; color: #555; }
  .totals td:last-child { text-align: right; }
  .totals .subtotal td { border-top: 1px solid #ccc; font-weight: bold; }
  .totals .grand-total td { border-top: 2px solid #333; font-size: 15px; font-weight: bold; padding-top: 6px; }
  .totals .deduct td { color: #c00; }
  .totals .spacer td { height: 8px; border: none; }
  .footer { margin-top: 60px; clear: both; font-size: 11px; color: #555; border-top: 1px solid #eee; padding-top: 16px; }
  .footer-cols { display: flex; gap: 40px; }
</style>
</head>
<body>

<div class="header">
  <div>
    <div class="sender">${d.owner.name} · ${d.owner.address} · ${d.owner.city}</div>
    <strong>${d.veranstalter.name}</strong><br>
    ${d.veranstalter.address}<br>
    ${d.veranstalter.city}
  </div>
  <div style="text-align:right">
    <h1>Rechnung</h1>
    Nr. ${d.invoiceNumber}<br>
    Datum: ${d.invoiceDate}<br>
    Fällig: ${d.dueDate}
  </div>
</div>

<p>Zeitraum: <strong>${d.monthName}</strong></p>

<h2>Touren</h2>
<table>
  <thead>
    <tr>
      <th>Datum</th><th>Tour</th>
      <th style="text-align:center">Pax</th>
      <th style="text-align:right">Honorar (netto)</th>
    </tr>
  </thead>
  <tbody>
    ${tourRows}
    <tr class="sum-row">
      <td colspan="3">Summe Honorar (netto)</td>
      <td style="text-align:right">${fmt(d.honorar.net)}</td>
    </tr>
  </tbody>
</table>

${reviewRows ? `
<h2>5★ Prämien</h2>
<table>
  <thead>
    <tr>
      <th>Datum</th><th>Tour</th>
      <th style="text-align:center">Bewertungen</th>
      <th style="text-align:right">Prämie (netto)</th>
    </tr>
  </thead>
  <tbody>
    ${reviewRows}
    <tr class="sum-row">
      <td colspan="3">Summe 5★ Prämien (netto)</td>
      <td style="text-align:right">${fmt(d.reviews.total)}</td>
    </tr>
  </tbody>
</table>
` : ""}

${auslagenRows ? `
<h2>Auslagen MVV</h2>
<table>
  <thead>
    <tr>
      <th>Datum</th><th>Tour</th><th>Position</th>
      <th style="text-align:right">Einkauf (brutto 7%)</th>
      <th style="text-align:right">Netto (abzgl. 7%)</th>
    </tr>
  </thead>
  <tbody>
    ${auslagenRows}
    <tr class="sum-row">
      <td colspan="3">Summe Auslagen</td>
      <td style="text-align:right">${fmt(d.mvv.purchaseGross)}</td>
      <td style="text-align:right">${fmt(d.mvv.net)}</td>
    </tr>
  </tbody>
</table>
` : ""}

${bargeldRows ? `
<h2>Bargeldeinnahmen</h2>
<table>
  <thead>
    <tr>
      <th>Datum</th><th>Tour</th>
      <th style="text-align:right">Betrag</th>
    </tr>
  </thead>
  <tbody>
    ${bargeldRows}
    <tr class="sum-row">
      <td colspan="2">Summe Bargeld</td>
      <td style="text-align:right">${fmt(d.cashTotal)}</td>
    </tr>
  </tbody>
</table>
` : ""}

<div class="totals">
  <table>
    <tr><td>Honorar (netto)</td><td>${fmt(d.honorar.net)}</td></tr>
    <tr><td>zzgl. MwSt. 19%</td><td>${fmt(d.honorar.vat19)}</td></tr>
    <tr class="subtotal"><td>Honorar (brutto)</td><td>${fmt(d.honorar.gross)}</td></tr>
    ${(d.reviews?.gross ?? 0) > 0 ? `
    <tr class="spacer"><td></td><td></td></tr>
    <tr><td>5★ Prämien (netto)</td><td>${fmt(d.reviews.total)}</td></tr>
    <tr><td>zzgl. MwSt. 19%</td><td>${fmt(d.reviews.vat19)}</td></tr>
    <tr class="subtotal"><td>5★ Prämien (brutto)</td><td>${fmt(d.reviews.gross)}</td></tr>
    ` : ""}
    ${(d.mvv?.billingGross ?? 0) > 0 ? `
    <tr class="spacer"><td></td><td></td></tr>
    <tr><td>Auslagen MVV (netto)</td><td>${fmt(d.mvv.net)}</td></tr>
    <tr><td>zzgl. MwSt. 19%</td><td>${fmt(d.mvv.vat19)}</td></tr>
    <tr class="subtotal"><td>Auslagen MVV (brutto)</td><td>${fmt(d.mvv.billingGross)}</td></tr>
    ` : ""}
    ${(d.cashTotal ?? 0) > 0 ? `
    <tr class="spacer"><td></td><td></td></tr>
    <tr class="deduct"><td>Abzgl. Bargeld</td><td>– ${fmt(d.cashTotal)}</td></tr>
    ` : ""}
    <tr class="grand-total"><td>Gesamtbetrag</td><td>${fmt(d.amountDue)}</td></tr>
  </table>
</div>

<div class="footer">
  <div class="footer-cols">
    <div>
      <strong>${d.owner.name}</strong><br>
      ${d.owner.address}<br>
      ${d.owner.city}<br>
      ${d.owner.email ? `${d.owner.email}<br>` : ""}
      ${d.owner.taxId ? `Steuernummer: ${d.owner.taxId}` : ""}
    </div>
    <div>
      <strong>Bankverbindung</strong><br>
      ${d.bank.name}<br>
      IBAN: ${d.bank.iban}<br>
      BIC: ${d.bank.bic}
    </div>
    <div>
      Bitte überweisen Sie den Betrag von <strong>${fmt(d.amountDue)}</strong><br>
      bis zum ${d.dueDate} unter Angabe der<br>
      Rechnungsnummer <strong>${d.invoiceNumber}</strong>.
    </div>
  </div>
</div>

</body></html>`;

  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
