import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function ReportMap({ reports = [], point, onSelectPoint, label = 'Map of reports on this page' }) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(null);
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    // Center on Colombo / Kelani Basin if interactive selection, else Sri Lanka wide
    const initialCenter = onSelectPointRef.current ? [6.945, 79.88] : [7.8, 80.7];
    const initialZoom = onSelectPointRef.current ? 12 : 7;
    map.current = L.map(container.current, { scrollWheelZoom: false }).setView(initialCenter, initialZoom);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).on('tileerror', () => setTileError(true)).addTo(map.current);
    markers.current = L.layerGroup().addTo(map.current);

    map.current.on('click', e => {
      if (onSelectPointRef.current) {
        onSelectPointRef.current({
          latitude: Number(e.latlng.lat.toFixed(6)),
          longitude: Number(e.latlng.lng.toFixed(6)),
        });
      }
    });

    const resize = new ResizeObserver(() => map.current?.invalidateSize());
    resize.observe(container.current);
    return () => { resize.disconnect(); map.current?.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!markers.current || !map.current) return;
    markers.current.clearLayers();
    const points = point ? [point] : reports;
    const coords = [];
    for (const r of points) {
      if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
      const popup = document.createElement('p');
      popup.textContent = point ? 'Your chosen location · unverified manual pin' : `${r.kind === 'help' ? 'Help request' : 'Hazard report'} · ${r.description} · submitted, not assessed`;
      const xy = [r.latitude, r.longitude]; coords.push(xy);
      L.circleMarker(xy, { radius: 8, color: r.kind === 'help' ? '#a55b19' : '#17644e', fillOpacity: 0.85 }).bindPopup(popup).addTo(markers.current);
    }
    if (coords.length) map.current.fitBounds(L.latLngBounds(coords), { padding: [35, 35], maxZoom: 14 });
    else if (!onSelectPoint) map.current.setView([7.8, 80.7], 7);
  }, [reports, point, onSelectPoint]);

  return (
    <section className="map-section">
      <div ref={container} className="report-map" aria-label={label} role="region" style={{ cursor: onSelectPoint ? 'crosshair' : 'default' }} />
      {tileError && <p className="muted text-xs p-2">Some basemap tiles could not load. The coordinate list remains available below.</p>}
      <p className="muted text-xs p-2">
        {label}. {onSelectPoint ? 'Click anywhere on the map to drop a pin. ' : ''}Pins are unverified submissions, not confirmed hazards or safe-route guidance. Basemap requires internet.
      </p>
    </section>
  );
}
