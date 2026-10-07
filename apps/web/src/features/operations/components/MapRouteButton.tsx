import { useState, type MouseEvent } from "react";
import type { Venues } from "@sever/contracts";
import { ActionIcon, Button, Sheet } from "../../../ui-kit/index.ts";
import { platform } from "../../../app/platform/telegram.ts";

type MapProvider = "google" | "yandex" | "apple";

function destination(venue: Venues.VenueDTO): string | null {
  if (venue.latitude != null && venue.longitude != null) return `${venue.latitude},${venue.longitude}`;
  return venue.address?.trim() || null;
}

export function mapRouteUrl(provider: MapProvider, venue: Venues.VenueDTO): string | null {
  const target = destination(venue);
  if (!target) return null;
  const encoded = encodeURIComponent(target);
  if (provider === "google") return `https://www.google.com/maps/dir/?api=1&destination=${encoded}`;
  if (provider === "yandex") return `https://yandex.ru/maps/?rtext=~${encoded}&rtt=auto`;
  return `https://maps.apple.com/?daddr=${encoded}&dirflg=d`;
}

export function MapRouteButton({ venue }: { venue: Venues.VenueDTO }) {
  const [open, setOpen] = useState(false);
  const hasDestination = destination(venue) !== null;

  if (!hasDestination) return null;

  const showChoices = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    setOpen(true);
  };
  const openMap = (provider: MapProvider) => {
    const url = mapRouteUrl(provider, venue);
    if (!url) return;
    setOpen(false);
    platform.openExternalUrl(url);
  };

  return <>
    <button className="icon-btn icon-btn--active" type="button" aria-label="Открыть в картах" title="Открыть в картах" onClick={showChoices}>
      <ActionIcon name="send" />
    </button>
    <Sheet open={open} onClose={() => setOpen(false)} title="Открыть в картах">
      <div className="stack" style={{ padding: "0 var(--space-4) var(--space-4)" }}>
        <Button block variant="secondary" onClick={() => openMap("google")}>Google Maps</Button>
        <Button block variant="secondary" onClick={() => openMap("yandex")}>Яндекс Карты</Button>
        <Button block variant="secondary" onClick={() => openMap("apple")}>Apple Maps</Button>
      </div>
    </Sheet>
  </>;
}
