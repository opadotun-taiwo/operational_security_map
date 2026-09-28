import React from 'react';
import { Activity } from 'lucide-react';

export default function TopBar({ filters, setFilters, states }) {
  return (
    <div className="w-full bg-gray-900 border-b border-gray-800 z-30 shadow-md">
      <div className="flex flex-wrap items-center justify-between px-6 py-3">
        
        {/* Logo Area */}
        <div className="flex items-center gap-2 mb-3 md:mb-0 mr-6">
          <Activity className="text-red-500" />
          <h1 className="text-xl font-bold text-white tracking-wide">
            OneSecure
          </h1>
        </div>

        {/* Filters Area */}
        <div className="flex flex-wrap items-center gap-4 flex-1 tutorial-step-1">
          <div className="flex items-center bg-gray-800 rounded-lg overflow-hidden border border-gray-700 min-w-[200px]">
            <span className="pl-3 text-gray-400">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </span>
            <input 
              type="text"
              placeholder="Search events..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full bg-transparent px-3 py-1.5 text-white focus:outline-none text-sm"
            />
          </div>

          <select
            value={filters.severity}
            onChange={(e) => setFilters({ ...filters, severity: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="All">All Severity</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select
            value={filters.eventType}
            onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="All">All Types</option>
            <option value="Terrorist Attack">Terrorist Attack</option>
            <option value="Kidnapping">Kidnapping</option>
            <option value="Armed Robbery">Armed Robbery</option>
            <option value="Civil Unrest">Civil Unrest</option>
          </select>

          <select
            value={filters.state}
            onChange={(e) => setFilters({ ...filters, state: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none"
          >
            <option value="All">All States</option>
            {states.map(state => (
              <option key={state} value={state}>{state}</option>
            ))}
          </select>
          
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">From:</span>
            <input 
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-sm">To:</span>
            <input 
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <input 
              type="checkbox"
              id="hubFilterTop"
              checked={filters.showOnlyNearHubs}
              onChange={(e) => setFilters({ ...filters, showOnlyNearHubs: e.target.checked })}
              className="w-4 h-4 rounded border-gray-700 bg-gray-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-900"
            />
            <label htmlFor="hubFilterTop" className="text-xs font-medium text-gray-300 cursor-pointer select-none">
              Near Hubs Only
            </label>
          </div>
        </div>
        
      </div>
    </div>
  );
}
