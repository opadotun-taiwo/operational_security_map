import React from 'react';
import { X, Calendar, MapPin, Users, ExternalLink, ShieldAlert, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DetailsPanel({ event, onClose }) {
  if (!event) return null;

  const isCritical = event.severity?.toLowerCase() === 'critical';

  return (
    <div className="absolute top-0 right-0 h-screen w-full sm:w-96 bg-gray-900 shadow-2xl border-l border-gray-800 z-50 transform transition-transform duration-300 ease-in-out flex flex-col">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          Event Details
        </h2>
        <button 
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <div className="flex items-start justify-between mb-4">
          <span className={`px-3 py-1 rounded-full text-xs font-bold ${
            isCritical ? 'bg-red-500/20 text-red-400 border border-red-500/50' : 
            event.severity?.toLowerCase() === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' : 
            'bg-blue-500/20 text-blue-400 border border-blue-500/50'
          }`}>
            {event.severity?.toUpperCase() || 'UNKNOWN'} SEVERITY
          </span>
          <span className="text-gray-400 text-sm flex items-center gap-1">
            {event.verification_status?.toLowerCase() === 'verified' ? (
              <><CheckCircle size={14} className="text-green-500" /> Verified</>
            ) : (
              <><ShieldAlert size={14} className="text-yellow-500" /> Unverified</>
            )}
          </span>
        </div>

        {event.isNearHub && (
          <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-lg p-3 flex items-start gap-3">
            <ShieldAlert className="text-red-500 shrink-0 mt-0.5" size={18} />
            <div>
              <p className="text-red-400 font-bold text-sm">Proximity Alert</p>
              <p className="text-red-300 text-xs mt-0.5">This incident occurred within 5km of an Operational Hub.</p>
            </div>
          </div>
        )}

        <h3 className="text-xl font-bold text-white mb-2">{event.event_type || 'Unknown Event'}</h3>
        
        <div className="space-y-4 mb-6">
          <div className="flex items-center text-gray-300 gap-3">
            <Calendar size={18} className="text-gray-500" />
            <span>{event.date ? format(new Date(event.date), 'PPP') : 'Unknown Date'}</span>
          </div>
          <div className="flex items-center text-gray-300 gap-3">
            <MapPin size={18} className="text-gray-500" />
            <span>{event.lga ? `${event.lga}, ` : ''}{event.state || 'Unknown Location'}</span>
          </div>
          <div className="flex flex-col text-gray-300 gap-2">
            <div className="flex items-center gap-3">
              <Users size={18} className="text-gray-500" />
              <span className="font-semibold text-sm uppercase tracking-wider text-gray-400">Casualties Breakdown</span>
            </div>
            <div className="flex gap-6 ml-8 text-sm font-medium">
              <span className="text-red-400 flex flex-col">
                <span className="text-gray-500 text-xs uppercase">Fatalities</span>
                {event.fatalities || 0}
              </span>
              <span className="text-orange-400 flex flex-col">
                <span className="text-gray-500 text-xs uppercase">Injured</span>
                {event.injured || 0}
              </span>
              <span className="text-purple-400 flex flex-col">
                <span className="text-gray-500 text-xs uppercase">Abducted</span>
                {event.abducted || 0}
              </span>
            </div>
          </div>
          {event.actors && (
            <div className="flex items-center text-gray-300 gap-3">
              <ShieldAlert size={18} className="text-gray-500" />
              <span>Actors: {event.actors}</span>
            </div>
          )}
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wider">Description</h4>
          <p className="text-gray-300 leading-relaxed text-sm">
            {event.description || 'No description available for this event.'}
          </p>
        </div>

        {event.source_url && (
          <a 
            href={event.source_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors text-sm font-medium border border-blue-500 mt-2"
          >
            Read Source Article <ExternalLink size={16} />
          </a>
        )}
      </div>
    </div>
  );
}
