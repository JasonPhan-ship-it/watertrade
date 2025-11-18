# DocuSign Water Transfer Flow

This project sends the Water Transfer Agreement PDF through DocuSign using the anchor strings embedded in the template and pre-fills the data before recipients open the envelope.

## Template location
- The PDF template is stored at `public/docs/Water-Transfer-Agreement.pdf` and is served by Next.js at `/docs/Water-Transfer-Agreement.pdf`.
- You can also reference the production URL `https://www.watertraders.com/docs/Water-Transfer-Agreement.pdf`.

## Anchors
The PDF expects these anchor strings:

- `{{BUYER_NAME}}`
- `{{BUYER_ACCOUNT}}`
- `{{SELLER_NAME}}`
- `{{SELLER_ACCOUNT}}`
- `{{AF_AMOUNT}}`
- `{{WATER_YEAR}}`
- `{{WATER_CODE}}`
- Literal `Date:` labels near the signature lines for `dateSigned` tabs.

## Envelope builder
- Server module: `lib/docusign-water-transfer.ts`
- Function: `createWaterTransferEnvelope(input)` builds the envelope body and posts it to DocuSign using `DOCUSIGN_ACCESS_TOKEN`, `DOCUSIGN_ACCOUNT_ID`, and `DOCUSIGN_BASE_URL` (or `DOCUSIGN_BASE_PATH`).
- The template URL defaults to `DOCUSIGN_FILE_URL` when set; otherwise it falls back to `/docs/Water-Transfer-Agreement.pdf` on the current app URL.

### Prefilled fields
`createWaterTransferEnvelope` now writes the water-trade metadata as **prefill tabs** so that the PDF opens with values already placed on the document. It expects:
- `buyerName`, `buyerEmail`, `buyerAccountNumber`
- `sellerName`, `sellerEmail`, `sellerAccountNumber`
- `afAmount`, `waterYear`, `waterCode`

## API endpoint
- Path: `POST /api/trades/:id/sign`
- Handler: `app/api/trades/[id]/sign/route.ts`
- Behavior: looks up the trade, fills buyer/seller names, emails, account numbers, AF amount, water year, and water code, calls `createWaterTransferEnvelope`, saves the `docusignEnvelopeId` on the Trade row, and returns `{ envelopeId, status }`.
- Returns 404 when the trade is missing; returns 500 with an error message if DocuSign fails.

Example request (using a local dev URL and static PDF):

```bash
curl -X POST http://localhost:3000/api/trades/<trade-id>/sign \
  -H "Content-Type: application/json"
```

## Assumptions / TODOs
- Account numbers and water metadata fall back to placeholder values (`TBD_ACCOUNT`, `UNKNOWN`) if real data is not present. Populate `Trade.buyerAccountNumber`, `Trade.sellerAccountNumber`, `Trade.waterYear`, and `Trade.waterCode` to avoid placeholders.
- DocuSign access currently expects a pre-issued access token via `DOCUSIGN_ACCESS_TOKEN`; integrate with the JWT helper in `lib/docusign.ts` when tokens are managed automatically.
