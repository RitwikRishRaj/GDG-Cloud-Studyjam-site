"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyReferralButton({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);

  async function copyReferralCode() {
    try {
      await navigator.clipboard.writeText("GDGC-KIIT1");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      className={className}
      type="button"
      onClick={copyReferralCode}
      aria-label={copied ? "Referral code copied" : "Copy referral code"}
    >
      {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}
