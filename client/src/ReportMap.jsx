import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

function createIcon(color, symbol) {
  return L.divIcon({
    className: 'custom-map-icon-wrapper',
    html: `<div style="background-color: ${color}; width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; font-size: 13px; color: white;">${symbol}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
}

const icons = {
  flood: createIcon('#ef4444', '🌊'),
  hazard: createIcon('#ef4444', '⚠️'),
  roadblock: createIcon('#f97316', '🚧'),
  resolved: createIcon('#10b981', '✓'),
  shelter: createIcon('#3b82f6', '🏠'),
  help: createIcon('#e11d48', '🆘'),
  pin: createIcon('#6366f1', '📍'),
};

export default function ReportMap({
  reports = [],
  shelters = [],
  incidents = [],
  point,
  onSelectPoint,
  label = 'Map of reports on this page',
  showLegend = false,
  height = '420px',
}) {
  const container = useRef(null);
  const map = useRef(null);
  const markers = useRef(null);
  const onSelectPointRef = useRef(onSelectPoint);
  onSelectPointRef.current = onSelectPoint;
  const [tileError, setTileError] = useState(false);

  useEffect(() => {
    // Default center on Colombo & Kelani basin
    const initialCenter = onSelectPointRef.current ? [6.945, 79.88] : [6.948, 79.88];
    const initialZoom = onSelectPointRef.current ? 12 : 12;
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
    return () => {
      resize.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    if (!markers.current || !map.current) return;
    markers.current.clearLayers();

    const coords = [];

    // 1. Render manual picked point if present
    if (point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)) {
      const xy = [point.latitude, point.longitude];
      coords.push(xy);
      const popup = document.createElement('div');
      popup.className = 'p-1 text-xs';
      popup.innerHTML = `<strong>Selected Location</strong><br/>${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)}<br/><span style="color:#64748b">Manual unverified pin</span>`;
      L.marker(xy, { icon: icons.pin }).bindPopup(popup).addTo(markers.current);
    }

    // 2. Render Incident road blocks
    for (const inc of incidents) {
      const lat = inc.location?.latitude || inc.centroid?.latitude;
      const lon = inc.location?.longitude || inc.centroid?.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        const xy = [lat, lon];
        coords.push(xy);
        const popup = document.createElement('div');
        popup.className = 'p-1.5 text-xs';
        const isClosed = inc.isRoadClosed;
        popup.innerHTML = `
          <div style="font-weight:700; color:${isClosed ? '#ea580c' : '#0f766e'}; margin-bottom:2px;">
            ${isClosed ? '🚧 Road Closure' : '⚠️ Active Incident'}
          </div>
          <strong style="font-size:12px; color:#0f172a;">${inc.title || 'Incident'}</strong>
          <div style="color:#64748b; font-size:11px; margin-top:2px;">${inc.ward?.name || ''}</div>
          <div style="font-size:11px; margin-top:4px;">${isClosed ? 'Corridor blocked · Dijkstra detour active' : (inc.summary || '')}</div>
        `;
        L.marker(xy, { icon: isClosed ? icons.roadblock : icons.hazard }).bindPopup(popup).addTo(markers.current);
      }
    }

    // 3. Render Shelters
    for (const s of shelters) {
      if (Number.isFinite(s.latitude) && Number.isFinite(s.longitude)) {
        const xy = [s.latitude, s.longitude];
        coords.push(xy);
        const popup = document.createElement('div');
        popup.className = 'p-1.5 text-xs';
        popup.innerHTML = `
          <div style="font-weight:700; color:#2563eb; margin-bottom:2px;">🏠 Evacuation Shelter</div>
          <strong style="font-size:12px; color:#0f172a;">${s.name}</strong>
          <div style="color:#64748b; font-size:11px; margin-top:2px;">${s.wardName || ''}</div>
          <div style="margin-top:4px; font-weight:600; color:#15803d; font-size:11px;">
            ${s.remainingCapacity || (s.maxCapacity - s.currentOccupancy)} spaces available
          </div>
        `;
        L.marker(xy, { icon: icons.shelter }).bindPopup(popup).addTo(markers.current);
      }
    }

    // 4. Render Citizen Reports
    for (const r of reports) {
      if (!Number.isFinite(r.latitude) || !Number.isFinite(r.longitude)) continue;
      const xy = [r.latitude, r.longitude];
      coords.push(xy);
      const isResolved = r.status === 'resolved';
      const isHelp = r.kind === 'help';
      const isFlood = (r.description || '').toLowerCase().includes('flood') || r.kind === 'hazard';

      const icon = isResolved
        ? icons.resolved
        : isHelp
        ? icons.help
        : isFlood
        ? icons.flood
        : icons.hazard;

      const popup = document.createElement('div');
      popup.className = 'p-1.5 text-xs';
      popup.innerHTML = `
        <div style="font-weight:700; color:${isResolved ? '#15803d' : isHelp ? '#e11d48' : '#ef4444'}; margin-bottom:2px;">
          ${isResolved ? '✓ Resolved' : isHelp ? '🆘 Help Request' : '🌊 Flood Report'}
        </div>
        <strong style="font-size:12px; color:#0f172a;">${r.description?.slice(0, 70) || 'Citizen report'}</strong>
        <div style="color:#64748b; font-size:11px; margin-top:3px;">
          Status: ${r.status || 'submitted'} · ${new Date(r.createdAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      `;
      L.marker(xy, { icon }).bindPopup(popup).addTo(markers.current);
    }

    if (coords.length > 0) {
      map.current.fitBounds(L.latLngBounds(coords), { padding: [35, 35], maxZoom: 14 });
    } else if (!onSelectPoint) {
      map.current.setView([6.948, 79.88], 12);
    }
  }, [reports, shelters, incidents, point, onSelectPoint]);

  return (
    <section className="map-section relative">
      {showLegend && (
        <div className="map-legend-card" role="note" aria-label="Map Legend">
          <div className="map-legend-item">
            <span className="map-legend-dot bg-red-500" />
            <span>Flood</span>
          </div>
          <div className="map-legend-item">
            <span className="map-legend-dot bg-amber-500" />
            <span>Road Block</span>
          </div>
          <div className="map-legend-item">
            <span className="map-legend-dot bg-emerald-500" />
            <span>Resolved</span>
          </div>
          <div className="map-legend-item">
            <span className="map-legend-dot bg-blue-500" />
            <span>Shelter</span>
          </div>
        </div>
      )}
      <div
        ref={container}
        className="report-map"
        aria-label={label}
        role="region"
        style={{ cursor: onSelectPoint ? 'crosshair' : 'default', height }}
      />
      {tileError && (
        <p className="muted text-xs p-2">Some basemap tiles could not load. The coordinate list remains available below.</p>
      )}
      <p className="muted text-xs p-2">
        {label}. {onSelectPoint ? 'Click anywhere on the map to drop a pin. ' : ''}Pins are unverified submissions, not confirmed hazards or safe-route guidance. Basemap requires internet.
      </p>
    </section>
  );
}

