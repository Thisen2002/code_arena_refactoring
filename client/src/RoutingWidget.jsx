import { useState, useEffect } from 'react';
import { request } from './api.js';

export default function RoutingWidget({ defaultOrigin = 'node-modara', defaultDest = 'node-borella', lang = 'en', t = {} }) {
  const [nodes, setNodes] = useState([]);
  const [closedRoads, setClosedRoads] = useState([]);
  const [origin, setOrigin] = useState(defaultOrigin);
  const [destination, setDestination] = useState(defaultDest);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [networkError, setNetworkError] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let active = true;
    async function fetchNetwork() {
      try {
        const data = await request('/api/routing/network');
        if (!active) return;
        setNodes(data.nodes || []);
        setClosedRoads(prev => {
          const nextClosures = data.closedRoads || [];
          const prevStr = JSON.stringify(prev.map(r => r.id).sort());
          const nextStr = JSON.stringify(nextClosures.map(r => r.id).sort());
          if (prevStr !== nextStr && origin && destination) {
            calculateRoute(origin, destination);
          }
          return nextClosures;
        });
        setNetworkError(false);
        setLastUpdated(new Date());
      } catch {
        if (!active) return;
        setNetworkError(true);
      }
    }

    fetchNetwork();
    const timer = setInterval(fetchNetwork, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [origin, destination]);

  async function calculateRoute(orig = origin, dest = destination) {
    if (!orig || !dest) return;
    setLoading(true);
    setError(null);
    try {
      const data = await request('/api/routing/plan', {
        method: 'POST',
        body: JSON.stringify({ originNodeId: orig, destinationNodeId: dest }),
      });
      setRoute(data);
    } catch (err) {
      setError(err.message || 'Failed to calculate route.');
      setRoute(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (origin && destination) {
      calculateRoute(origin, destination);
    }
  }, [origin, destination]);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-2 gap-2">
        <div className="flex items-center gap-2">
          <span className="badge bg-indigo-100 text-indigo-900 border-indigo-300 font-bold text-xs uppercase">
            SIMULATED DEMO
          </span>
          <h3 className="font-bold text-sm text-slate-800">Route Avoiding Recorded Closures (Dijkstra)</h3>
        </div>
        <div className="flex items-center gap-2">
          {closedRoads.length > 0 && (
            <span className="badge bg-rose-100 text-rose-800 border-rose-300 text-xs font-semibold">
              {closedRoads.length} Road {closedRoads.length === 1 ? 'Closure' : 'Closures'} Active
            </span>
          )}
          {lastUpdated && (
            <span className="text-[11px] text-slate-500">
              Updated {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {networkError && (
        <div role="alert" className="p-3 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900">
          ⚠️ Live corridor closure feed offline. Navigation calculations may not reflect recent road blockages.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="route-origin" className="block text-xs font-semibold text-slate-700 mb-1">
            {t.originLabel || (lang === 'si' ? 'ආරම්භක ස්ථානය' : 'Origin Hub')}
          </label>
          <select
            id="route-origin"
            value={origin}
            onChange={e => setOrigin(e.target.value)}
            className="w-full text-xs p-2 border border-slate-300 rounded bg-white text-slate-800"
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.wardId})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="route-destination" className="block text-xs font-semibold text-slate-700 mb-1">
            {t.destinationLabel || (lang === 'si' ? 'ගමනාන්තය / නවාතැන' : 'Destination Hub')}
          </label>
          <select
            id="route-destination"
            value={destination}
            onChange={e => setDestination(e.target.value)}
            className="w-full text-xs p-2 border border-slate-300 rounded bg-white text-slate-800"
          >
            {nodes.map(n => (
              <option key={n.id} value={n.id}>{n.name} ({n.wardId})</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div className="text-xs text-slate-500 py-2">Calculating path avoiding active hazards…</div>}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded text-xs text-rose-800">
          <strong>Routing Error:</strong> {error}
        </div>
      )}

      {route && !route.success && (
        <div className="p-4 bg-rose-100 border border-rose-300 rounded-lg text-rose-900 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-bold text-sm text-rose-900">
            <span>⚠️ NO SAFE PASSABLE ROUTE IN SIMULATION</span>
          </div>
          <p>{route.message}</p>
          {route.closedRoads?.length > 0 && (
            <div className="text-xs bg-white/70 p-2 rounded border border-rose-200">
              <strong>Closed Corridors:</strong> {route.closedRoads.join(', ')}
            </div>
          )}
          <p className="text-xs text-rose-950">
            Note: This outcome reflects simulated demonstration corridors. In a real emergency, follow instructions from the Disaster Management Centre (DMC) and local police.
          </p>
        </div>
      )}

      {route && route.success && (
        <div className="space-y-3">
          {route.hasDetour && (
            <div className="p-2.5 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 flex items-start gap-2">
              <span className="font-bold">⚠️ Hazard Detour Applied:</span>
              <span>
                Standard corridor is closed. Rerouted around: {route.closedRoadsAvoided.join(', ')}.
              </span>
            </div>
          )}

          <div className="flex items-center justify-between bg-white border border-slate-200 p-3 rounded-lg text-xs">
            <div>
              <span className="text-slate-500 block">Total Distance</span>
              <strong className="text-sm text-slate-800">
                {(route.totalDistanceMeters / 1000).toFixed(1)} km
              </strong>
            </div>
            <div>
              <span className="text-slate-500 block">Estimated Time</span>
              <strong className="text-sm text-slate-800">~{route.estimatedMinutes} mins</strong>
            </div>
            <div>
              <span className="text-slate-500 block">Waypoints</span>
              <strong className="text-sm text-slate-800">{route.path?.length} hubs</strong>
            </div>
          </div>

          <div className="p-3 bg-white border border-slate-200 rounded-lg space-y-2">
            <div className="text-xs font-semibold text-slate-700">Safe Route Progression:</div>
            <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600">
              {route.path?.map((node, i) => (
                <li key={node.id} className={i === 0 ? 'font-bold text-slate-900' : i === route.path.length - 1 ? 'font-bold text-emerald-800' : ''}>
                  {node.name}
                  {i < (route.edges?.length || 0) && (
                    <span className="text-slate-400 text-[11px] block ml-4">
                      via {route.edges[i].roadName} ({route.edges[i].distanceMeters}m, ~{route.edges[i].estimatedMinutes}m)
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      <div className="p-2.5 bg-slate-100 rounded text-[11px] text-slate-600 italic border border-slate-200">
        <strong>Mandatory Safety Notice:</strong> SIMULATED DEMO ONLY - NEVER GUARANTEES REAL-WORLD SAFETY. In an actual emergency, follow directives from local emergency services and the Disaster Management Centre (DMC).
      </div>
    </div>
  );
}
