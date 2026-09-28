import React from 'react';
import { X, MapPin, Calendar, ShieldAlert } from 'lucide-react';
import { format } from 'date-fns';

export default function ClusterPanel({ events, onClose, onEventClick }) {
  if (!events || events.length === 0) return null;

  return (
    <div className="absolute top-0 right-0 h-screen w-full sm:w-96 bg-gray-900 shadow-2xl border-l border-gray-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Cluster Incidents
          <span className="bg-blue-500/20 text-blue-400 text-xs px-2 py-0.5 rounded-full border border-blue-500/50">
            {events.length}
          </span>
        </h2>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto space-y-3">
        {events.map((event) => {
          const isCritical = event.severity?.toLowerCase() === 'critical';
          const isHigh = event.severity?.toLowerCase() === 'high';

          let borderClass = 'border-blue-500/30 hover:border-blue-500/80';
          let badgeClass = 'bg-blue-500/20 text-blue-400 border border-blue-500/50';
          
          if (isCritical) {
            borderClass = 'border-red-500/30 hover:border-red-500/80';
            badgeClass = 'bg-red-500/20 text-red-400 border border-red-500/50';
          } else if (isHigh) {
            borderClass = 'border-orange-500/30 hover:border-orange-500/80';
            badgeClass = 'bg-orange-500/20 text-orange-400 border border-orange-500/50';
          }

          return (
            <div 
              key={event.event_id || event.id}
              onClick={() => onEventClick(event)}
              className={`bg-gray-800/50 p-4 rounded-xl border ${borderClass} cursor-pointer transition-all hover:bg-gray-800`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-white font-bold text-sm line-clamp-1">{event.event_type || 'Unknown Event'}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${badgeClass} ml-2 whitespace-nowrap`}>
                  {event.severity?.toUpperCase()}
                </span>
              </div>
              <div className="space-y-1 text-xs text-gray-400">
                <div className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-gray-500" />
                  <span>{event.date ? format(new Date(event.date), 'MMM d, yyyy') : 'Unknown Date'}</span>
                </div>
                <div className="flex items-center gap-1.5 line-clamp-1">
                  <MapPin size={12} className="text-gray-500 shrink-0" />
                  <span className="truncate">{event.lga ? `${event.lga}, ` : ''}{event.state}</span>
                </div>
              </div>
              {event.isNearHub && (
                <div className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-400 bg-red-500/10 px-2 py-1 rounded w-max border border-red-500/20">
                  <ShieldAlert size={12} /> Near Hub
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
