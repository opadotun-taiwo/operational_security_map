import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import DetailsPanel from './components/DetailsPanel';
import ClusterPanel from './components/ClusterPanel';
import RoutePanel from './components/RoutePanel';
import TopBar from './components/TopBar';
import Tutorial from './components/Tutorial';
import ReportIncidentPanel from './components/ReportIncidentPanel';
import { Loader2 } from 'lucide-react';
import { annotateHubThreats } from './utils/hubThreats';
import { getOperatingStates, isInOperatingStates, canonicalState } from './utils/operatingStates';

// Default map scope: only incidents in the operating area around hubs are drawn
const DEFAULT_HUB_RADIUS_KM = 10;

function App() {
  // Raw rows from Supabase; `events`/`hubs` below are the derived, annotated versions
  const [rawEvents, setRawEvents] = useState([]);
  const [rawHubs, setRawHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedClusterEvents, setSelectedClusterEvents] = useState(null);
  const [activeHub, setActiveHub] = useState(null);
  const [tutorialRestart, setTutorialRestart] = useState(0);
  const [isMobileStatusOpen, setIsMobileStatusOpen] = useState(false);

  // Incident reporting
  const [isReportOpen, setIsReportOpen] = useState(false);
  const [isPickingLocation, setIsPickingLocation] = useState(false);
  const [pickedLocation, setPickedLocation] = useState(null);
  const [focusRequest, setFocusRequest] = useState(null);
  // Incidents reported in this session stay visible even outside the hub-area filter
  const [reportedIds, setReportedIds] = useState([]);

  // Layer toggles
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    hubs: true,
    proximity: true,
    hotspots: false,
  });

  // Hotspot configuration
  const [hotspotSettings, setHotspotSettings] = useState({
    timeHorizon: 'all', // 'all' | '90d' | '30d'
    weightedBySeverity: true
  });

  // Route Intelligence state
  const [isRoutePanelOpen, setIsRoutePanelOpen] = useState(false);
  const [activeRouteData, setActiveRouteData] = useState(null);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState(0);

  // Filters state
  const [filters, setFilters] = useState({
    search: '',
    severity: 'All',
    eventType: 'All',
    verificationStatus: 'All',
    state: 'All',
    hubRadiusKm: DEFAULT_HUB_RADIUS_KM, // number (km) | 'all'
    dateFrom: '',
    dateTo: '',
  });

  // Loads incidents and hubs. Re-run after a new incident report is submitted.
  const loadData = useCallback(async () => {
    try {
      const [eventsResponse, hubsResponse] = await Promise.all([
        supabase.from('security_events').select('*'),
        supabase.from('one_acre_fund_locations').select('*')
      ]);

      if (eventsResponse.error) throw eventsResponse.error;
      if (hubsResponse.error) throw hubsResponse.error;

      const loaded = { events: eventsResponse.data || [], hubs: hubsResponse.data || [] };
      setRawEvents(loaded.events);
      setRawHubs(loaded.hubs);
      return loaded;
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // State is only set after the fetch resolves, never synchronously in the effect
    Promise.resolve().then(loadData);
  }, [loadData]);

  // Only incidents in hub states plus the expansion states are shown anywhere in the app
  const operatingStates = useMemo(() => getOperatingStates(rawHubs, rawEvents), [rawHubs, rawEvents]);
  const { events, hubs } = useMemo(
    () => annotateHubThreats(rawEvents.filter(e => isInOperatingStates(e, operatingStates)), rawHubs),
    [rawEvents, rawHubs, operatingStates]
  );
  const existingEventIds = useMemo(() => rawEvents.map(e => e.event_id).filter(Boolean), [rawEvents]);

  const uniqueStates = useMemo(() => {
    const states = new Set(events.map(e => e.state).filter(Boolean));
    return Array.from(states).sort();
  }, [events]);

  const uniqueEventTypes = useMemo(() => {
    const types = new Set(events.map(e => e.event_type).filter(Boolean));
    return Array.from(types).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const searchMatch = !filters.search || 
        (event.description?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
        (event.lga?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
        (event.location?.toLowerCase() || '').includes(filters.search.toLowerCase());

      const severityMatch = filters.severity === 'All' || 
        event.severity?.toLowerCase() === filters.severity.toLowerCase();

      const eventTypeMatch = filters.eventType === 'All' || 
        event.event_type?.toLowerCase() === filters.eventType.toLowerCase();

      const verificationMatch = filters.verificationStatus === 'All' ||
        (event.verification_status || '').toLowerCase() === filters.verificationStatus.toLowerCase();

      const stateMatch = filters.state === 'All' || 
        canonicalState(event.state) === canonicalState(filters.state);

      const eventDate = event.date ? new Date(event.date) : null;
      let dateMatch = true;
      if (eventDate) {
        if (filters.dateFrom) {
          const from = new Date(filters.dateFrom);
          if (eventDate < from) dateMatch = false;
        }
        if (filters.dateTo) {
          const to = new Date(filters.dateTo);
          if (eventDate > to) dateMatch = false;
        }
      }

      return searchMatch && severityMatch && eventTypeMatch && verificationMatch && stateMatch && dateMatch;
    });
  }, [events, filters]);

  // Incidents drawn on the map: those inside the hub operating area, plus any on the
  // selected route's corridor (route analysis still uses every filtered incident).
  const selectedCorridorIncidents = activeRouteData?.routes?.[selectedRouteIndex]?.exposure?.corridorIncidents;
  const visibleEvents = useMemo(() => {
    const inHubArea = filters.hubRadiusKm === 'all'
      ? filteredEvents
      : filteredEvents.filter(e => e.nearestHubKm !== null && e.nearestHubKm <= filters.hubRadiusKm);
    const ids = new Set(inHubArea.map(e => e.event_id || e.id));
    const extras = [
      ...(selectedCorridorIncidents || []),
      ...filteredEvents.filter(e => reportedIds.includes(e.event_id || e.id))
    ].filter(e => {
      const id = e.event_id || e.id;
      if (ids.has(id)) return false;
      ids.add(id);
      return true;
    });
    return extras.length ? [...inHubArea, ...extras] : inHubArea;
  }, [filteredEvents, filters.hubRadiusKm, selectedCorridorIncidents, reportedIds]);

  const threateningEvents = events.filter(e => e.isNearHub);
  const isAnyHubThreatened = threateningEvents.length > 0;

  if (error) {
    return (
      <div className="h-screen w-full bg-gray-950 flex items-center justify-center text-white flex-col">
        <div className="text-red-500 mb-4 bg-red-500/10 p-4 rounded-full">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Error Loading Intelligence Data</h2>
        <p className="text-gray-400">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors font-medium"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-950 text-white font-sans">
      <Tutorial restartToken={tutorialRestart} />
      <TopBar 
        filters={filters} 
        setFilters={setFilters} 
        states={uniqueStates}
        eventTypes={uniqueEventTypes}
        isRoutePanelOpen={isRoutePanelOpen}
        setIsRoutePanelOpen={setIsRoutePanelOpen}
        hasActiveRoute={Boolean(activeRouteData)}
        onShowHelp={() => setTutorialRestart(n => n + 1)}
        onReportIncident={() => {
          setIsReportOpen(true);
          setSelectedEvent(null);
          setSelectedClusterEvents(null);
        }}
        isReportOpen={isReportOpen}
      />
      
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          events={visibleEvents}
          totalFilteredCount={filteredEvents.length}
          hubRadiusKm={filters.hubRadiusKm}
          includesRouteCorridor={Boolean(selectedCorridorIncidents?.length)}
          onShowAll={() => setFilters(f => ({ ...f, hubRadiusKm: 'all' }))}
          operatingStates={operatingStates}
          isAnyHubThreatened={isAnyHubThreatened}
          threateningEvents={threateningEvents}
          onEventClick={(event) => {
            setSelectedEvent(event);
            setIsMobileStatusOpen(false);
          }}
          isMobileOpen={isMobileStatusOpen}
        />
        
        <main className="flex-1 relative min-w-0">
          {/* Phones: the status sidebar is a toggle so the map keeps the screen */}
          <button
            onClick={() => setIsMobileStatusOpen(o => !o)}
            className="md:hidden absolute bottom-20 left-4 z-30 bg-gray-900/95 border border-gray-700 text-white text-xs font-semibold px-3 py-2 rounded-xl shadow-xl"
          >
            {isMobileStatusOpen ? 'Show map' : `Status · ${visibleEvents.length} incidents`}
          </button>
          {loading ? (
            <div className="absolute inset-0 z-30 bg-gray-950/80 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-cyan-400 animate-spin" />
                <p className="text-cyan-300 font-medium tracking-wide">Loading intelligence feeds & hubs...</p>
              </div>
            </div>
          ) : null}

          {/* Route Planning & Security Exposure Panel */}
          <RoutePanel
            isOpen={isRoutePanelOpen}
            onClose={() => setIsRoutePanelOpen(false)}
            hubs={hubs}
            events={filteredEvents}
            activeRouteData={activeRouteData}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRouteIndex={setSelectedRouteIndex}
            onRouteCalculated={(routePayload, { keepSelection = false } = {}) => {
              setActiveRouteData(routePayload);
              if (!keepSelection) setSelectedRouteIndex(0);
            }}
            onClearRoute={() => {
              setActiveRouteData(null);
              setSelectedRouteIndex(0);
            }}
            onSelectEvent={(event) => {
              setSelectedEvent(event);
            }}
          />

          <MapArea 
            events={visibleEvents}
            hubRadiusKm={filters.hubRadiusKm}
            hubs={hubs}
            onEventClick={setSelectedEvent} 
            onClusterClick={setSelectedClusterEvents}
            mapLayers={mapLayers}
            setMapLayers={setMapLayers}
            activeHub={activeHub}
            setActiveHub={setActiveHub}
            activeRouteData={activeRouteData}
            selectedRouteIndex={selectedRouteIndex}
            onSelectRouteIndex={setSelectedRouteIndex}
            hotspotSettings={hotspotSettings}
            setHotspotSettings={setHotspotSettings}
            isPickingLocation={isPickingLocation}
            onPickLocation={(location) => {
              setPickedLocation(location);
              setIsPickingLocation(false);
            }}
            pickedLocation={isReportOpen ? pickedLocation : null}
            focusRequest={focusRequest}
          />

          {!loading && visibleEvents.length === 0 && (
            <div className="absolute inset-0 z-[15] pointer-events-none flex items-center justify-center">
              <div className="bg-gray-900/90 backdrop-blur-md px-8 py-6 rounded-2xl border border-gray-800 flex flex-col items-center shadow-2xl">
                <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-bold text-white mb-1">No security events found</h3>
                <p className="text-gray-400 text-sm">
                  {filters.hubRadiusKm === 'all' || filteredEvents.length === 0
                    ? 'Try broadening your filter criteria'
                    : `None within ${filters.hubRadiusKm} km of a hub. Widen the "Show" range in the top bar.`}
                </p>
              </div>
            </div>
          )}

          {isReportOpen ? (
            <ReportIncidentPanel
              onClose={() => {
                setIsReportOpen(false);
                setIsPickingLocation(false);
                setPickedLocation(null);
              }}
              hubs={hubs}
              states={operatingStates.all}
              eventTypes={uniqueEventTypes}
              existingEventIds={existingEventIds}
              isPickingLocation={isPickingLocation}
              onStartPicking={() => setIsPickingLocation(p => !p)}
              pickedLocation={pickedLocation}
              onSubmitted={async (savedRows) => {
                const rows = (Array.isArray(savedRows) ? savedRows : [savedRows]).filter(Boolean);
                const refreshed = await loadData();
                const ids = rows.map(r => r.event_id || r.id).filter(id => id !== undefined);
                setReportedIds(prev => [...prev, ...ids]);
                setPickedLocation(null);
                if (rows.length === 0) return;
                // Single report: open it. Bulk upload: fly to the first one.
                const first = rows[0];
                setFocusRequest({ lat: parseFloat(first.latitude), lng: parseFloat(first.longitude), at: Date.now() });
                if (rows.length === 1) {
                  const annotated = refreshed ? annotateHubThreats(refreshed.events, refreshed.hubs).events : [];
                  const match = annotated.find(e => (e.event_id || e.id) === ids[0]);
                  if (match) setSelectedEvent(match);
                }
              }}
            />
          ) : selectedEvent ? (
            <DetailsPanel 
              event={selectedEvent} 
              onClose={() => setSelectedEvent(null)} 
            />
          ) : (
            <ClusterPanel 
              events={selectedClusterEvents}
              onClose={() => setSelectedClusterEvents(null)}
              onEventClick={(e) => setSelectedEvent(e)}
            />
          )}
        </main>
      </div>
    </div>
  );
}

export default App;
