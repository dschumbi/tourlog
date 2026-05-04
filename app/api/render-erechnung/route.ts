import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || key !== process.env.INVOICE_API_KEY) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let d: any;
  try {
    d = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const owner = d.owner ?? {};
    const bank = d.bank ?? {};
    const veranstalter = d.veranstalter ?? {};

    const today = new Date();
    const todayXml = today.toISOString().slice(0, 10).replace(/-/g, "");
    const paymentDays = d.rechnung?.paymentDays ?? 14;
    const dueD = new Date(today);
    dueD.setDate(dueD.getDate() + paymentDays);
    const dueDateXml = dueD.toISOString().slice(0, 10).replace(/-/g, "");
    const prefix = d.rechnung?.prefix ?? "RE";
    const m = String(d.month ?? today.getMonth() + 1).padStart(2, "0");
    const yr = d.year ?? today.getFullYear();
    const month = d.month ?? today.getMonth() + 1;
    const year = d.year ?? today.getFullYear();
    // Lieferdatum = letzter Tag des Abrechnungsmonats (Pflichtfeld EN 16931)
    const deliveryDateXml = new Date(year, month, 0).toISOString().slice(0, 10).replace(/-/g, "");
    const invoiceNumber = d.invoiceNumber ?? `${prefix}-${yr}-${m}-001`;

    function splitCity(cityStr: string) {
      const parts = (cityStr ?? "").trim().split(" ");
      return { postcode: parts[0] ?? "", city: (parts.slice(1).join(" ") || parts[0]) ?? "" };
    }
    const ownerCity = splitCity(owner.city);
    const buyerCity = splitCity(veranstalter.city);

    const honorarNet = d.honorar?.net ?? 0;
    const reviewTotal = d.reviews?.total ?? 0;
    const mvvNet = d.mvv?.net ?? 0;
    const cashTotal = d.cashTotal ?? 0;

    const lineTotal = honorarNet + reviewTotal + mvvNet;
    const taxBasis = lineTotal;
    const taxAmount = Math.round(taxBasis * 0.19 * 100) / 100;
    const grandTotal = Math.round((taxBasis + taxAmount) * 100) / 100;
    const duePayable = Math.round((grandTotal - cashTotal) * 100) / 100;

    const fmt = (n: number) => n.toFixed(2);

    // Fetch receipt URLs from DB for MVV tours in this month
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);
    const toursWithReceipts = await prisma.tour.findMany({
      where: {
        date: { gte: monthStart, lt: monthEnd },
        mvvReceiptUrls: { isEmpty: false },
      },
      select: { id: true, mvvReceiptUrls: true },
    });

    // Fetch and base64-encode each receipt
    const attachments: Array<{ id: string; name: string; mimeCode: string; base64: string }> = [];
    let attachIdx = 1;
    for (const tour of toursWithReceipts) {
      for (const url of tour.mvvReceiptUrls) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;
          const contentType = res.headers.get("content-type") ?? "";
          const mimeCode = contentType.split(";")[0].trim() || guessMime(url);
          const buf = await res.arrayBuffer();
          const base64 = Buffer.from(buf).toString("base64");
          const ext = mimeCode === "application/pdf" ? "pdf" : mimeCode.split("/")[1] ?? "jpg";
          attachments.push({
            id: `beleg-${attachIdx}`,
            name: `MVV Beleg ${attachIdx}`,
            mimeCode,
            base64,
          });
          attachIdx++;
        } catch {
          // skip unloadable receipts
        }
      }
    }

    const attachmentXml = attachments.map((a) => `
  <ram:AdditionalReferencedDocument>
    <ram:IssuerAssignedID>${escXml(a.id)}</ram:IssuerAssignedID>
    <ram:TypeCode>916</ram:TypeCode>
    <ram:Name>${escXml(a.name)}</ram:Name>
    <ram:AttachmentBinaryObject mimeCode="${escXml(a.mimeCode)}" filename="${escXml(a.id)}.${a.mimeCode.split("/")[1] ?? "jpg"}">${a.base64}</ram:AttachmentBinaryObject>
  </ram:AdditionalReferencedDocument>`).join("");

    let lineIndex = 1;

    function lineItem(id: number, name: string, netAmount: number) {
      return `
  <ram:IncludedSupplyChainTradeLineItem>
    <ram:AssociatedDocumentLineDocument>
      <ram:LineID>${id}</ram:LineID>
    </ram:AssociatedDocumentLineDocument>
    <ram:SpecifiedTradeProduct>
      <ram:Name>${escXml(name)}</ram:Name>
    </ram:SpecifiedTradeProduct>
    <ram:SpecifiedLineTradeAgreement>
      <ram:NetPriceProductTradePrice>
        <ram:ChargeAmount>${fmt(netAmount)}</ram:ChargeAmount>
      </ram:NetPriceProductTradePrice>
    </ram:SpecifiedLineTradeAgreement>
    <ram:SpecifiedLineTradeDelivery>
      <ram:BilledQuantity unitCode="C62">1</ram:BilledQuantity>
    </ram:SpecifiedLineTradeDelivery>
    <ram:SpecifiedLineTradeSettlement>
      <ram:ApplicableTradeTax>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradeSettlementLineMonetarySummation>
        <ram:LineTotalAmount>${fmt(netAmount)}</ram:LineTotalAmount>
      </ram:SpecifiedTradeSettlementLineMonetarySummation>
    </ram:SpecifiedLineTradeSettlement>
  </ram:IncludedSupplyChainTradeLineItem>`;
    }

    const lines = [
      lineItem(lineIndex++, `Touren-Honorar ${d.monthName ?? ""}`, honorarNet),
      ...(reviewTotal > 0 ? [lineItem(lineIndex++, `5★ Prämien ${d.monthName ?? ""}`, reviewTotal)] : []),
      ...(mvvNet > 0 ? [lineItem(lineIndex++, `Auslagen MVV ${d.monthName ?? ""}`, mvvNet)] : []),
    ].join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">

  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_3.0</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>

  <rsm:ExchangedDocument>
    <ram:ID>${escXml(invoiceNumber)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${todayXml}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>

  <rsm:SupplyChainTradeTransaction>
${lines}

    <ram:ApplicableHeaderTradeAgreement>
      <ram:BuyerReference>${escXml(invoiceNumber)}</ram:BuyerReference>
      <ram:SellerTradeParty>
        <ram:Name>${escXml(owner.name ?? "")}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(ownerCity.postcode)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(owner.address ?? "")}</ram:LineOne>
          <ram:CityName>${escXml(ownerCity.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        ${owner.email ? `<ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escXml(owner.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ""}
        ${owner.taxId ? `<ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="FC">${escXml(owner.taxId)}</ram:ID>
        </ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${escXml(veranstalter.name ?? "")}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${escXml(buyerCity.postcode)}</ram:PostcodeCode>
          <ram:LineOne>${escXml(veranstalter.address ?? "")}</ram:LineOne>
          <ram:CityName>${escXml(buyerCity.city)}</ram:CityName>
          <ram:CountryID>DE</ram:CountryID>
        </ram:PostalTradeAddress>
        ${veranstalter.email ? `<ram:URIUniversalCommunication>
          <ram:URIID schemeID="EM">${escXml(veranstalter.email)}</ram:URIID>
        </ram:URIUniversalCommunication>` : ""}
      </ram:BuyerTradeParty>
      ${attachmentXml}
    </ram:ApplicableHeaderTradeAgreement>

    <ram:ApplicableHeaderTradeDelivery>
      <ram:ActualDeliverySupplyChainEvent>
        <ram:OccurrenceDateTime>
          <udt:DateTimeString format="102">${deliveryDateXml}</udt:DateTimeString>
        </ram:OccurrenceDateTime>
      </ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>

    <ram:ApplicableHeaderTradeSettlement>
      <ram:PaymentReference>${escXml(invoiceNumber)}</ram:PaymentReference>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${bank.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>58</ram:TypeCode>
        <ram:PayeePartyCreditorFinancialAccount>
          <ram:IBANID>${escXml(bank.iban.replace(/\s/g, ""))}</ram:IBANID>
        </ram:PayeePartyCreditorFinancialAccount>
        ${bank.bic ? `<ram:PayeeSpecifiedCreditorFinancialInstitution>
          <ram:BICID>${escXml(bank.bic)}</ram:BICID>
        </ram:PayeeSpecifiedCreditorFinancialInstitution>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>` : ""}
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${fmt(taxAmount)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        <ram:BasisAmount>${fmt(taxBasis)}</ram:BasisAmount>
        <ram:CategoryCode>S</ram:CategoryCode>
        <ram:RateApplicablePercent>19</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime>
          <udt:DateTimeString format="102">${dueDateXml}</udt:DateTimeString>
        </ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${fmt(lineTotal)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${fmt(taxBasis)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${fmt(taxAmount)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${fmt(grandTotal)}</ram:GrandTotalAmount>
        ${cashTotal > 0 ? `<ram:TotalPrepaidAmount>${fmt(cashTotal)}</ram:TotalPrepaidAmount>` : ""}
        <ram:DuePayableAmount>${fmt(duePayable)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="eRechnung-${yr}-${m}.xml"`,
      },
    });
  } catch (e) {
    console.error("render-erechnung error:", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

function escXml(s: string): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function guessMime(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".png")) return "image/png";
  return "image/jpeg";
}
