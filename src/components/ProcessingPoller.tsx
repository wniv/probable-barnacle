"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * While a set still has videos processing, periodically refreshes the server-rendered page to
 * show progress, and pings the ad-set endpoint to resume the background driver if it stalled
 * (e.g. after an instance restart). Renders nothing; unmounts/stops once `active` is false.
 */
export function ProcessingPoller({
  adSetIds,
  active,
  intervalMs = 4000,
}: {
  adSetIds: string[];
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  const idsKey = adSetIds.join(",");

  useEffect(() => {
    if (!active || !idsKey) return;
    const ids = idsKey.split(",");

    const tick = async () => {
      await Promise.all(
        ids.map((id) => fetch(`/api/ad-sets/${id}`, { method: "POST" }).catch(() => {}))
      );
      router.refresh();
    };

    const timer = setInterval(tick, intervalMs);
    return () => clearInterval(timer);
  }, [idsKey, active, intervalMs, router]);

  return null;
}
