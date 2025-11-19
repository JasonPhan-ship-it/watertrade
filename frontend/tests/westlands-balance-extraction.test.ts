import { describe, expect, it } from "vitest";

import { extractBalance } from "@/app/api/integrations/westlands/balance/route";

describe("extractBalance", () => {
  it("parses basic table markup", () => {
    const html = `
      <table>
        <tr>
          <td>Balance as of Last Statement:</td>
          <td>$1,234.50</td>
        </tr>
      </table>
    `;

    const result = extractBalance(html);
    expect(result).toEqual({ text: "$1,234.50", value: 1234.5 });
  });

  it("handles non-breaking spaces between the currency symbol and digits", () => {
    const html = `
      <div>
        Balance as of Last Statement:&nbsp;&nbsp;<strong>$&nbsp;9,876.54</strong>
      </div>
    `;

    const result = extractBalance(html);
    expect(result).toEqual({ text: "$ 9,876.54", value: 9876.54 });
  });
});
