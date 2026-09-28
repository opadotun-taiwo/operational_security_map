import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from './supabase';
import Sidebar from './components/Sidebar';
import MapArea from './components/MapArea';
import DetailsPanel from './components/DetailsPanel';
import ClusterPanel from './components/ClusterPanel';
import TopBar from './components/TopBar';
import Tutorial from './components/Tutorial';
import { Loader2 } from 'lucide-react';
import * as turf from '@turf/turf';

function App() {
  const [events, setEvents] = useState([]);
  const [hubs, setHubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedClusterEvents, setSelectedClusterEvents] = useState(null);
  const [activeHub, setActiveHub] = useState(null);
  const [mapLayers, setMapLayers] = useState({
    incidents: true,
    hubs: true,
    proximity: true,
    hotspots: false,
  });

  const [filters, setFilters] = useState({
    search: '',
    severity: 'All',
    eventType: 'All',
    state: 'All',
    showOnlyNearHubs: false,
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [eventsResponse, hubsResponse] = await Promise.all([
          supabase.from('security_events').select('*'),
          supabase.from('one_acre_fund_locations').select('*')
        ]);

        if (eventsResponse.error) throw eventsResponse.error;
        if (hubsResponse.error) throw hubsResponse.error;

        const rawEvents = eventsResponse.data || [];
        const rawHubs = hubsResponse.data || [];
        
        // Calculate proximity for events and hubs
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const processedEvents = rawEvents.map(event => {
          let isNearHub = false;
          const isRecent = event.date ? new Date(event.date) >= threeMonthsAgo : false;

          if (isRecent && event.latitude && event.longitude) {
            const eventPoint = turf.point([parseFloat(event.longitude), parseFloat(event.latitude)]);
            for (const hub of rawHubs) {
              if (hub.latitude && hub.longitude) {
                const hubPoint = turf.point([parseFloat(hub.longitude), parseFloat(hub.latitude)]);
                const distance = turf.distance(eventPoint, hubPoint, { units: 'kilometers' });
                if (distance <= 5) {
                  isNearHub = true;
                  break;
                }
              }
            }
          }
          return { ...event, isNearHub, isRecent };
        });

        const processedHubs = rawHubs.map(hub => {
          let isThreatened = false;
          if (hub.latitude && hub.longitude) {
            const hubPoint = turf.point([parseFloat(hub.longitude), parseFloat(hub.latitude)]);
            for (const event of processedEvents) {
              if (event.isRecent && event.latitude && event.longitude) {
                const eventPoint = turf.point([parseFloat(event.longitude), parseFloat(event.latitude)]);
                const distance = turf.distance(hubPoint, eventPoint, { units: 'kilometers' });
                if (distance <= 5) {
                  isThreatened = true;
                  break;
                }
              }
            }
          }
          return { ...hub, isThreatened };
        });

        setHubs(processedHubs);
        setEvents(processedEvents);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const uniqueStates = useMemo(() => {
    const states = new Set(events.map(e => e.state).filter(Boolean));
    return Array.from(states).sort();
  }, [events]);

  const filteredEvents = useMemo(() => {
    return events.filter(event => {
      const searchMatch = !filters.search || 
        (event.description?.toLowerCase() || '').includes(filters.search.toLowerCase()) ||
        (event.lga?.toLowerCase() || '').includes(filters.search.toLowerCase());

      const severityMatch = filters.severity === 'All' || 
        event.severity?.toLowerCase() === filters.severity.toLowerCase();

      const eventTypeMatch = filters.eventType === 'All' || 
        event.event_type?.toLowerCase() === filters.eventType.toLowerCase();

      const stateMatch = filters.state === 'All' || 
        event.state === filters.state;

      const nearHubMatch = !filters.showOnlyNearHubs || event.isNearHub;

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

      return searchMatch && severityMatch && eventTypeMatch && stateMatch && nearHubMatch && dateMatch;
    });
  }, [events, filters]);

  if (error) {
    return (
      <div className="h-screen w-full bg-gray-900 flex items-center justify-center text-white flex-col">
        <div className="text-red-500 mb-4 bg-red-500/10 p-4 rounded-full">
          <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-xl font-bold mb-2">Error Loading Data</h2>
        <p className="text-gray-400">{error}</p>
        <button 
          onClick={() => window.location.reload()}
          className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const threateningEvents = events.filter(e => e.isNearHub);
  const isAnyHubThreatened = threateningEvents.length > 0;

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden bg-gray-900 text-white font-sans">
      <Tutorial />
      <TopBar 
        filters={filters} 
        setFilters={setFilters} 
        states={uniqueStates} 
      />
      
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar 
          events={filteredEvents}
          isAnyHubThreatened={isAnyHubThreatened}
          threateningEvents={threateningEvents}
          onEventClick={setSelectedEvent}
        />
        
        <main className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 z-20 bg-gray-900/80 flex items-center justify-center backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4">
                <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                <p className="text-blue-400 font-medium tracking-wide">Loading live events & hubs...</p>
              </div>
            </div>
          ) : null}

          <MapArea 
            events={filteredEvents} 
            hubs={hubs}
            onEventClick={setSelectedEvent} 
            onClusterClick={setSelectedClusterEvents}
            mapLayers={mapLayers}
            setMapLayers={setMapLayers}
            activeHub={activeHub}
            setActiveHub={setActiveHub}
          />

          {!loading && filteredEvents.length === 0 && (
            <div className="absolute inset-0 z-[15] pointer-events-none flex items-center justify-center">
              <div className="bg-gray-900/90 backdrop-blur-md px-8 py-6 rounded-2xl border border-gray-800 flex flex-col items-center shadow-2xl">
                <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <h3 className="text-lg font-bold text-white mb-1">No events found</h3>
                <p className="text-gray-400 text-sm">Try adjusting your filter criteria</p>
              </div>
            </div>
          )}

          {selectedEvent ? (
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
