import React from 'react';
import { Activity, Navigation } from 'lucide-react';

export default function TopBar({ 
  filters, 
  setFilters, 
  states, 
  isRoutePanelOpen, 
  setIsRoutePanelOpen,
  hasActiveRoute = false
}) {
  return (
    <div className="w-full bg-gray-900 border-b border-gray-800 z-30 shadow-md">
      <div className="flex flex-wrap items-center justify-between px-4 sm:px-6 py-2.5 gap-3">
        
        {/* Logo Area */}
        <div className="flex items-center gap-2.5 mr-2">
          <div className="p-1.5 bg-red-500/20 rounded-lg border border-red-500/40">
            <Activity className="text-red-500 w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-1.5">
              OneSecure
              <span className="text-[10px] font-semibold text-cyan-400 bg-cyan-950 px-1.5 py-0.2 rounded border border-cyan-800">
                PRO
              </span>
            </h1>
            <p className="text-[10px] text-gray-400">Security Intelligence Portal</p>
          </div>
        </div>

        {/* Route Intelligence Toggle Button */}
        <button
          onClick={() => setIsRoutePanelOpen(!isRoutePanelOpen)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shadow-sm ${
            isRoutePanelOpen
              ? 'bg-blue-600 text-white shadow-blue-500/20 ring-1 ring-blue-400'
              : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700 border border-gray-700'
          }`}
          title="Toggle Route Planning and Exposure Analysis"
        >
          <Navigation size={14} className={isRoutePanelOpen ? 'text-white' : 'text-blue-400'} />
          <span>Route Intelligence</span>
          {hasActiveRoute && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          )}
        </button>

        {/* Filters Area */}
        <div className="flex flex-wrap items-center gap-3 flex-1 tutorial-step-1">
          {/* Search */}
          <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden border border-gray-700 min-w-[180px] flex-1 max-w-xs">
            <span className="pl-3 text-gray-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input 
              type="text"
              placeholder="Search incidents, LGA..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full bg-transparent px-3 py-1 text-white focus:outline-none text-xs"
            />
          </div>

          {/* Severity */}
          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Event Type */}
          <select
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Event Types</option>
            <option value="Terrorist Attack">Terrorist Attack</option>
            <option value="Kidnapping">Kidnapping</option>
            <option value="Armed Robbery">Armed Robbery</option>
            <option value="Civil Unrest">Civil Unrest</option>
          </select>

          {/* Verification Status Filter */}
          <select
            value={filters.verificationStatus || 'All'}
            onChange={(e) => setFilters({ ...filters, verificationStatus: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
          >
            <option value="All">All Verification</option>
            <option value="Verified">Verified Only</option>
            <option value="Unverified">Unverified Only</option>
          </select>

          {/* State */}
          <select
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:border-blue-500 max-w-[140px]"
          >
            <option value="All">All States</option>
            {states.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          
          {/* Date Range */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>From:</span>
            <input 
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <span>To:</span>
            <input 
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-0.5 text-xs text-white focus:outline-none"
            />
          </div>

          {/* Near Hubs Filter */}
          <div className="flex items-center gap-2 ml-auto">
            <input 
              type="checkbox"
              id="hubFilterTop"
              checked={filters.showOnlyNearHubs}
              onChange={(e) => setFilters({ ...filters, showOnlyNearHubs: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
            />
            <label htmlFor="hubFilterTop" className="text-xs font-medium text-gray-300 cursor-pointer select-none whitespace-nowrap">
              Near Hubs (&le;5km)
            </label>
          </div>
        </div>
        
      </div>
    </div>
  );
}
