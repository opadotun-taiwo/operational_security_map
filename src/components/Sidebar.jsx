import React from 'react';
import { Activity, AlertCircle, Skull } from 'lucide-react';

const StatCard = ({ title, value, icon: Icon, colorClass }) => (
  <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-800 flex items-center justify-between hover:bg-gray-800/80 transition-colors">
    <div>
      <p className="text-gray-400 text-sm font-medium mb-1">{title}</p>
      <p className="text-3xl font-bold text-white tracking-tight">{value}</p>
    </div>
    <div className={`p-3 rounded-lg ${colorClass}`}>
      <Icon size={24} />
    </div>
  </div>
);

export default function Sidebar({ events, isAnyHubThreatened, threateningEvents, onEventClick }) {
  const totalIncidents = events.length;
  const totalFatalities = events.reduce((sum, e) => sum + (e.fatalities || 0), 0);
  const totalInjured = events.reduce((sum, e) => sum + (e.injured || 0), 0);
  const totalAbducted = events.reduce((sum, e) => sum + (e.abducted || 0), 0);
  const criticalCount = events.filter(e => e.severity?.toLowerCase() === 'critical').length;

  return (
    <div className="w-full md:w-80 bg-gray-900 border-r border-gray-800 h-full flex flex-col z-20 shadow-2xl overflow-y-auto relative">
      <div className="p-6 space-y-4">
        <h2 className="text-sm uppercase tracking-wider text-gray-500 font-bold mb-4">Live Status</h2>
        
        {isAnyHubThreatened ? (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                <AlertCircle size={24} className="text-red-500" />
              </div>
              <div>
                <p className="text-red-400 font-bold text-sm">Alert: Hubs Threatened</p>
                <p className="text-red-300/80 text-xs mt-0.5">Events detected within 5km of operations</p>
              </div>
            </div>
            {threateningEvents && threateningEvents.length > 0 && (
              <div className="mt-2 flex flex-col gap-2 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {threateningEvents.map(event => (
                  <button
                    key={event.id || event.event_id}
                    onClick={() => onEventClick && onEventClick(event)}
                    className="text-left text-xs bg-red-500/20 hover:bg-red-500/30 text-red-200 p-2 rounded-lg border border-red-500/20 transition-colors"
                  >
                    <span className="font-bold">{event.event_type || 'Event'}</span> - {event.date ? new Date(event.date).toLocaleDateString() : 'Unknown Date'}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2 bg-green-500/20 rounded-lg shrink-0">
              <Activity size={24} className="text-green-500" />
            </div>
            <div>
              <p className="text-green-400 font-bold text-sm">Operations Safe</p>
              <p className="text-green-300/80 text-xs mt-0.5">No incidents within 5km of any hub</p>
            </div>
          </div>
        )}

        <div className="pt-4 space-y-4">
          <StatCard title="Total Incidents" value={totalIncidents} icon={Activity} colorClass="bg-blue-500/20 text-blue-400" />
          <StatCard title="Fatalities" value={totalFatalities} icon={Skull} colorClass="bg-red-500/20 text-red-400" />
          <StatCard title="Injured" value={totalInjured} icon={AlertCircle} colorClass="bg-orange-500/20 text-orange-400" />
          <StatCard title="Abducted" value={totalAbducted} icon={AlertCircle} colorClass="bg-purple-500/20 text-purple-400" />
          <StatCard title="Critical Alerts" value={criticalCount} icon={AlertCircle} colorClass="bg-red-500/20 text-red-400" />
        </div>
      </div>
    </div>
  );
}
