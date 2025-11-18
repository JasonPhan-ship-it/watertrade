import "server-only";

export type ContractData = {
  transferorName: string;
  transferorAccount: string;
  transfereeName: string;
  transfereeAccount: string;
  waterYear: string;
  waterCode: string;
  amountAF: number;
  pricePerAF: number;
  totalPrice: number;
  role: "buyer" | "seller";
};

export function generateWaterTransferAgreement(data: ContractData): string {
  // Format currency
  const priceFormatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  });

  const formattedPricePerAF = priceFormatter.format(data.pricePerAF);
  const formattedTotalPrice = priceFormatter.format(data.totalPrice);

  // Determine who is signing based on role (for the SignHere anchor)
  // In the buyer flow, the buyer signs as Transferee.
  // In the seller flow, the seller signs as Transferor.
  // Water Traders LLC signs the other side (conceptually).
  
  // We will use a single anchor /sn1/ for the primary signer of this envelope.
  // The other party (Water Traders LLC) is assumed to have "signed" or is pre-filled.

  return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: 'Times New Roman', serif; line-height: 1.5; color: #000; max-width: 800px; margin: 0 auto; padding: 40px; }
    h1 { text-align: center; font-size: 18pt; font-weight: bold; text-decoration: underline; margin-bottom: 30px; }
    .section { margin-bottom: 20px; }
    .field { font-weight: bold; border-bottom: 1px solid #000; padding: 0 5px; display: inline-block; min-width: 100px; text-align: center; }
    .signature-block { margin-top: 50px; display: flex; justify-content: space-between; }
    .signature-box { width: 45%; }
    .signature-line { border-top: 1px solid #000; margin-top: 40px; padding-top: 5px; }
  </style>
</head>
<body>

  <h1>WATER TRANSFER AGREEMENT</h1>

  <div class="section">
    <p>This Water Transfer Agreement ("Agreement") is entered into by and between:</p>
    
    <p><strong>Transferor:</strong> <span class="field">${data.transferorName}</span></p>
    <p>Water Account No: <span class="field">${data.transferorAccount}</span></p>
    
    <p>AND</p>

    <p><strong>Transferee:</strong> <span class="field">${data.transfereeName}</span></p>
    <p>Water Account No: <span class="field">${data.transfereeAccount}</span></p>
  </div>

  <div class="section">
    <p><strong>1. RECITALS</strong></p>
    <p>Transferor desires to transfer and Transferee desires to accept a quantity of water as described below.</p>
  </div>

  <div class="section">
    <p><strong>2. TRANSFER DETAILS</strong></p>
    <ul>
      <li><strong>Water Year:</strong> <span class="field">${data.waterYear}</span></li>
      <li><strong>Water Code/Type:</strong> <span class="field">${data.waterCode}</span></li>
      <li><strong>Quantity:</strong> <span class="field">${data.amountAF}</span> Acre-Feet</li>
      <li><strong>Price per Acre-Foot:</strong> <span class="field">${formattedPricePerAF}</span></li>
      <li><strong>Total Consideration:</strong> <span class="field">${formattedTotalPrice}</span></li>
    </ul>
  </div>

  <div class="section">
    <p><strong>3. TERMS</strong></p>
    <p>The Transferor hereby transfers to the Transferee the rights to the water described above. The Transferee agrees to pay the Total Consideration upon execution of this Agreement and approval by the relevant Water District.</p>
  </div>

  <div class="signature-block">
    <div class="signature-box">
      <p><strong>TRANSFEROR</strong></p>
      <p>${data.transferorName}</p>
      <div class="signature-line">
        ${data.role === 'seller' ? '/sn1/' : '<i>Signed by Water Traders LLC</i>'}
      </div>
      <p>Date: ${new Date().toLocaleDateString()}</p>
    </div>

    <div class="signature-box">
      <p><strong>TRANSFEREE</strong></p>
      <p>${data.transfereeName}</p>
      <div class="signature-line">
        ${data.role === 'buyer' ? '/sn1/' : '<i>Signed by Water Traders LLC</i>'}
      </div>
      <p>Date: ${new Date().toLocaleDateString()}</p>
    </div>
  </div>

</body>
</html>
  `;
}
