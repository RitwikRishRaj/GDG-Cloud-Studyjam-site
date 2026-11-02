"use client";

import { useEffect, useState } from "react";
import { CAMPAIGN_DEADLINE } from "@/lib/campaign";
import styles from "./milestone-board.module.css";

const deadline = Date.parse(CAMPAIGN_DEADLINE.timestamp);
const units = [
  ["days", 86_400, null],
  ["hours", 3_600, 86_400],
  ["minutes", 60, 3_600],
  ["seconds", 1, 60],
] as const;

export function MilestoneCountdown() {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const update = () => {
      const current = Date.now();
      setNow(current);
      if (current >= deadline) window.clearInterval(interval);
    };
    const interval = window.setInterval(update, 1_000);
    update();
    return () => window.clearInterval(interval);
  }, []);

  if (now !== null && now >= deadline) {
    return <p className={styles.countdownEnded} role="status">Campaign ended</p>;
  }

  const remaining = now === null ? null : Math.ceil((deadline - now) / 1_000);
  const finalDay = remaining !== null && remaining <= 86_400;
  const values = units.map(([label, seconds, modulus]) => {
    if (remaining === null) return [label, "--"] as const;
    const value = Math.floor(
      modulus === null ? remaining / seconds : (remaining % modulus) / seconds
    );
    return [label, String(value).padStart(label === "days" ? 1 : 2, "0")] as const;
  });

  return (
    <div className={styles.countdownGroup}>
      <span className="study-mono">{finalDay ? "Final day" : "Campaign deadline"}</span>
      <div
        className={`${styles.countdown} ${finalDay ? styles.finalDay : ""}`}
        role="timer"
        aria-label={
          now === null
            ? "Countdown to 23 November 2026 at 11:59 PM India time"
            : values.map(([label, value]) => `${value} ${label}`).join(", ")
        }
      >
        {values.map(([label, value]) => (
          <div className={styles.countdownUnit} key={label}>
            <span className={styles.countdownValue}>{value}</span>
            <span className={styles.countdownLabel}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
