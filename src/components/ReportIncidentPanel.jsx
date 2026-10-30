import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Lock, Crosshair, CheckCircle2, AlertTriangle, Loader2, FilePlus2, Home, Search,
  LocateFixed, Upload, Download, FileSpreadsheet, MapPin, RefreshCw
} from 'lucide-react';
import {
  isAuthorizedReporter,
  fetchIncidentColumns,
  buildIncidentRecord,
  submitIncidentReports,
  normalizeEmail,
  buildTemplateCsv,
  readIncidentCsv,
  nextEventId,
  SEVERITY_OPTIONS,
  CONFIDENCE_OPTIONS,
  VERIFICATION_OPTIONS,
  DEFAULT_EVENT_TYPES
} from '../services/incidentReports';
import { reverseGeocode, geocodeAddress, searchPlaces, resolvePlace, newPlacesSession, currentPosition } from '../services/geocoding';
import { nearestHub } from '../utils/routeComparison';
import { canonicalState } from '../utils/operatingStates';

const SESSION_KEY = 'oneSecureReporter';

function readSessionEmail() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const initialValues = () => ({
  date: todayIso(),
  state: '', lga: '', location: '', latitude: '', longitude: '',
  event_type: '', severity: '', description: '',
  fatalities: '', injured: '', abducted: '', actors: '',
  source: 'OAF field staff', source_url: '', source_date: todayIso(),
  confidence: 'Medium', verification_status: 'Unverified'
});

const inputClass = (hasError) =>
  `w-full bg-gray-950 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${
    hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:border-green-500 focus:ring-green-500'
  }`;

/**
 * Side panel for approved staff to add incidents to security_events, one at a time
 * or by uploading the CSV template.
 */
export default function ReportIncidentPanel({
  onClose,
  hubs = [],
  states = [],
  eventTypes = [],
  existingEventIds = [],
  isPickingLocation,
  onStartPicking,
  pickedLocation,
  onSubmitted
}) {
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);
  const [mode, setMode] = useState('form'); // 'form' | 'upload'
  const [columns, setColumns] = useState(null);

  // Re-use an email already verified in this browser session
  useEffect(() => {
    const saved = readSessionEmail();
    if (!saved) return;
    isAuthorizedReporter(saved).then(ok => ok && setVerifiedEmail(saved));
  }, []);

  // Confirm the live table's columns once the reporter is verified
  useEffect(() => {
    if (!verifiedEmail) return undefined;
    let cancelled = false;
    fetchIncidentColumns().then(cols => !cancelled && setColumns(cols)).catch(() => {});
    return () => { cancelled = true; };
  }, [verifiedEmail]);

  const allEventTypes = useMemo(
    () => Array.from(new Set([...DEFAULT_EVENT_TYPES, ...eventTypes])).sort(),
    [eventTypes]
  );

  const handleVerify = async (e) => {
    e.preventDefault();
    setEmailError(null);
    setIsCheckingEmail(true);
    const ok = await isAuthorizedReporter(emailInput);
    setIsCheckingEmail(false);
    if (!ok) {
      setEmailError('This email is not authorised to submit incident reports. Contact the GR team if you need access.');
      return;
    }
    const email = normalizeEmail(emailInput);
    try {
      sessionStorage.setItem(SESSION_KEY, email);
    } catch {
      // Storage unavailable; the reporter re-enters the email next time
    }
    setVerifiedEmail(email);
  };

  const signOut = () => {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch {
      // ignore
    }
    setVerifiedEmail('');
    setEmailInput('');
  };

  return (
    <div className="absolute top-0 right-0 h-full w-full sm:w-[440px] bg-gray-900 shadow-2xl border-l border-gray-800 z-50 flex flex-col">
      <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <FilePlus2 size={20} className="text-red-400" /> Report an Incident
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
          aria-label="Close panel"
          title="Close"
        >
          <X size={20} />
        </button>
      </div>

      {!verifiedEmail ? (
        <form onSubmit={handleVerify} className="p-6 space-y-4">
          <div className="flex items-center gap-3 text-gray-300">
            <div className="p-2.5 bg-gray-800 rounded-xl border border-gray-700">
              <Lock size={20} className="text-green-400" />
            </div>
            <p className="text-sm leading-relaxed">
              Incident reporting is limited to approved staff. Enter your One Acre Fund email to continue.
            </p>
          </div>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-gray-400">Work email</span>
            <input
              type="email"
              autoComplete="email"
              autoFocus
              required
              value={emailInput}
              onChange={(e) => { setEmailInput(e.target.value); setEmailError(null); }}
              placeholder="name@oneacrefund.org"
              className={inputClass(Boolean(emailError))}
            />
          </label>
          {emailError && (
            <p className="text-xs text-red-300 flex items-start gap-1.5" role="alert">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" /> {emailError}
            </p>
          )}
          <button
            type="submit"
            disabled={isCheckingEmail || !emailInput.trim()}
            className="w-full py-2.5 bg-green-600 hover:bg-green-500 disabled:bg-green-900/60 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isCheckingEmail ? <Loader2 size={16} className="animate-spin" /> : null}
            Continue
          </button>
        </form>
      ) : (
        <>
          <div className="px-5 pt-4 space-y-3">
            <div className="flex items-center justify-between text-xs text-gray-400">
              <span>Signed in as an approved reporter</span>
              <button type="button" onClick={signOut} className="text-gray-400 hover:text-white underline underline-offset-2">
                Use a different email
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-950 rounded-xl border border-gray-800" role="tablist">
              {[
                { id: 'form', label: 'Fill in form', icon: FilePlus2 },
                { id: 'upload', label: 'Upload file', icon: FileSpreadsheet }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  onClick={() => setMode(tab.id)}
                  className={`py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                    mode === tab.id ? 'bg-gray-800 text-white shadow' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <tab.icon size={15} /> {tab.label}
                </button>
              ))}
            </div>
          </div>

          {mode === 'form' ? (
            <SingleReportForm
              email={verifiedEmail}
              columns={columns}
              hubs={hubs}
              states={states}
              eventTypes={allEventTypes}
              existingEventIds={existingEventIds}
              isPickingLocation={isPickingLocation}
              onStartPicking={onStartPicking}
              pickedLocation={pickedLocation}
              onSubmitted={onSubmitted}
              onClose={onClose}
            />
          ) : (
            <BulkUpload
              email={verifiedEmail}
              columns={columns}
              states={states}
              existingEventIds={existingEventIds}
              onSubmitted={onSubmitted}
              onClose={onClose}
            />
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single report
// ---------------------------------------------------------------------------

function SingleReportForm({
  email, columns, hubs, states, eventTypes, existingEventIds,
  isPickingLocation, onStartPicking, pickedLocation, onSubmitted, onClose
}) {
  const [values, setValues] = useState(initialValues);
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [locating, setLocating] = useState(null); // text of the lookup in progress
  const [locationInfo, setLocationInfo] = useState(null); // { address, precision, warning }

  const setValue = (key, value) => {
    setValues(v => ({ ...v, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const matchState = (name) => states.find(s => canonicalState(s) === canonicalState(name)) || null;

  // Fill coordinates and the address columns from a lookup result
  // Address fields are replaced (not merged) so values from an earlier lookup never linger
  const applyLocation = (result, precision) => {
    const outsideNigeria = result.country && result.country !== 'Nigeria';
    const state = outsideNigeria ? null : matchState(result.state);
    setValues(v => ({
      ...v,
      latitude: result.lat !== undefined ? result.lat.toFixed(6) : v.latitude,
      longitude: result.lng !== undefined ? result.lng.toFixed(6) : v.longitude,
      state: state || '',
      lga: outsideNigeria ? '' : result.lga || '',
      location: outsideNigeria ? '' : result.location || ''
    }));
    setErrors(e => ({ ...e, latitude: undefined, longitude: undefined, state: undefined, lga: undefined }));
    let warning = null;
    if (outsideNigeria) warning = `This point is in ${result.country}, outside Nigeria. Choose a location inside Nigeria.`;
    else if (result.state && !state) warning = `${result.state} is not one of the operating states, so this incident would not be shown on the map.`;
    else if (!result.lga) warning = 'The LGA could not be found for this point. Please enter it.';
    setLocationInfo({ address: result.formattedAddress, precision, warning });
  };

  const lookupCoordinates = async (lat, lng, precision) => {
    setLocating('Finding the state, LGA and place name…');
    try {
      const address = await reverseGeocode(lat, lng);
      applyLocation({ ...address, lat, lng }, precision);
    } catch (err) {
      setValues(v => ({ ...v, latitude: lat.toFixed(6), longitude: lng.toFixed(6) }));
      setLocationInfo({ address: '', precision, warning: `${err.message}. Enter the state and LGA yourself.` });
    } finally {
      setLocating(null);
    }
  };

  // Map click from "Pick on map": look up the address for the clicked point
  const lookupRef = useRef(lookupCoordinates);
  useEffect(() => {
    lookupRef.current = lookupCoordinates;
  });
  useEffect(() => {
    if (!pickedLocation) return;
    Promise.resolve().then(() => lookupRef.current(pickedLocation.lat, pickedLocation.lng, 'Picked on map'));
  }, [pickedLocation]);

  const useMyLocation = async () => {
    setLocating('Getting your current location…');
    try {
      const pos = await currentPosition();
      await lookupCoordinates(pos.lat, pos.lng, `Your location (±${pos.accuracyM} m)`);
    } catch (err) {
      setLocating(null);
      setLocationInfo({ address: '', precision: null, warning: err.message });
    }
  };

  const hubHint = useMemo(() => {
    const lat = parseFloat(values.latitude);
    const lng = parseFloat(values.longitude);
    if (isNaN(lat) || isNaN(lng) || hubs.length === 0) return null;
    return nearestHub({ latitude: lat, longitude: lng }, hubs);
  }, [values.latitude, values.longitude, hubs]);

  const previewEventId = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(values.date)) return null;
    return nextEventId(values.date, new Set(existingEventIds));
  }, [values.date, existingEventIds]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const { record, errors: validation } = buildIncidentRecord(values, {
      operatingStates: states,
      takenIds: new Set(existingEventIds),
      columns
    });
    setErrors(validation);
    if (!record) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const [saved] = await submitIncidentReports([record], email);
      setSubmitted(saved || record);
      onSubmitted?.([saved || record]);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="p-6 space-y-4 text-center">
        <CheckCircle2 size={44} className="mx-auto text-green-400" />
        <div>
          <p className="text-lg font-bold text-white">Report added</p>
          <p className="text-sm text-gray-400 mt-1">
            {submitted.event_type} in {submitted.lga ? `${submitted.lga}, ` : ''}{submitted.state} was saved as{' '}
            <span className="font-mono text-gray-200">{submitted.event_id}</span> and is now on the map.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setValues(initialValues()); setErrors({}); setSubmitted(null); setLocationInfo(null); }}
            className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-sm font-medium"
          >
            Report another
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium">
            Done
          </button>
        </div>
      </div>
    );
  }

  const field = (key, label, input, { required = false, wide = false, hint } = {}) => (
    <label className={`block space-y-1 ${wide ? 'col-span-2' : ''}`}>
      <span className="text-xs font-medium text-gray-300">
        {label} {required && <span className="text-red-400">*</span>}
      </span>
      {input}
      {errors[key] ? <span className="block text-[11px] text-red-300">{errors[key]}</span> : hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
    </label>
  );
  const text = (key, props = {}) => (
    <input value={values[key] ?? ''} onChange={(e) => setValue(key, e.target.value)} className={inputClass(Boolean(errors[key]))} {...props} />
  );
  const select = (key, options, placeholder) => (
    <select value={values[key] ?? ''} onChange={(e) => setValue(key, e.target.value)} className={inputClass(Boolean(errors[key]))}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const count = (key) => text(key, { type: 'number', min: 0, step: 1, inputMode: 'numeric', placeholder: 'Unknown' });

  return (
    <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
      <p className="text-xs text-gray-400">Fields marked <span className="text-red-400">*</span> are required.</p>

      {/* 1. Location */}
      <section className="bg-gray-800/40 border border-gray-700/70 rounded-xl p-3.5 space-y-3">
        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">1. Where did it happen?</h3>
        <PlaceSearch onSelect={(result) => applyLocation(result, 'Matched place')} onBusy={setLocating} />
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={useMyLocation}
            className="py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border bg-gray-900 border-gray-600 text-white hover:border-green-500"
          >
            <LocateFixed size={14} /> Use my location
          </button>
          <button
            type="button"
            onClick={onStartPicking}
            className={`py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1.5 border transition-colors ${
              isPickingLocation
                ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-200 animate-pulse'
                : 'bg-gray-900 border-gray-600 text-white hover:border-green-500'
            }`}
          >
            <Crosshair size={14} /> {isPickingLocation ? 'Click the map…' : 'Pick on map'}
          </button>
        </div>

        {locating && (
          <p className="text-xs text-gray-300 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {locating}</p>
        )}
        {locationInfo && !locating && (
          <div className={`text-xs rounded-lg p-2.5 border ${locationInfo.warning ? 'border-yellow-500/40 bg-yellow-500/10 text-yellow-100' : 'border-green-500/30 bg-green-500/10 text-green-100'}`}>
            {locationInfo.address && <p className="flex items-start gap-1.5"><MapPin size={13} className="shrink-0 mt-0.5" /> {locationInfo.address}</p>}
            {locationInfo.precision && <p className="text-[11px] opacity-75 mt-0.5">Source: {locationInfo.precision}. Check the fields below and adjust if needed.</p>}
            {locationInfo.warning && <p className="mt-1">{locationInfo.warning}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5">
          {field('latitude', 'Latitude', text('latitude', { type: 'number', step: 'any', inputMode: 'decimal', placeholder: 'e.g. 9.5920' }), { required: true })}
          {field('longitude', 'Longitude', text('longitude', { type: 'number', step: 'any', inputMode: 'decimal', placeholder: 'e.g. 6.5241' }), { required: true })}
          <div className="col-span-2 -mt-1 flex items-center justify-between gap-2">
            {hubHint?.nearestHubName ? (
              <span className="text-[11px] text-gray-400 flex items-center gap-1"><Home size={11} /> {hubHint.nearestHubKm} km from {hubHint.nearestHubName} hub</span>
            ) : <span />}
            <button
              type="button"
              disabled={!values.latitude || !values.longitude || Boolean(locating)}
              onClick={() => lookupCoordinates(parseFloat(values.latitude), parseFloat(values.longitude), 'Typed coordinates')}
              className="text-[11px] text-green-400 hover:text-green-300 disabled:text-gray-600 flex items-center gap-1"
            >
              <RefreshCw size={11} /> Fill address from coordinates
            </button>
          </div>
          {field('state', 'State', select('state', states, 'Select state…'), { required: true })}
          {field('lga', 'LGA', text('lga', { placeholder: 'e.g. Chanchaga' }), { required: true })}
          {field('location', 'Location', text('location', { placeholder: 'Town, village, market or road' }), { wide: true })}
        </div>
      </section>

      {/* 2. What happened */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">2. What happened?</h3>
        <datalist id="report-event-types">
          {eventTypes.map(t => <option key={t} value={t} />)}
        </datalist>
        <div className="grid grid-cols-2 gap-2.5">
          {field('date', 'Date of incident', text('date', { type: 'date', max: todayIso() }), { required: true })}
          {field('severity', 'Severity', select('severity', SEVERITY_OPTIONS, 'Select…'), { required: true })}
          {field('event_type', 'Event type', text('event_type', { list: 'report-event-types', placeholder: 'e.g. Kidnapping' }), { required: true, wide: true })}
          {field('description', 'Description',
            <textarea
              rows={4}
              value={values.description}
              onChange={(e) => setValue('description', e.target.value)}
              placeholder="What happened, who was affected, and what is known so far."
              className={inputClass(Boolean(errors.description))}
            />,
            { required: true, wide: true })}
          <div className="col-span-2 grid grid-cols-3 gap-2">
            {field('fatalities', 'Fatalities', count('fatalities'))}
            {field('injured', 'Injured', count('injured'))}
            {field('abducted', 'Abducted', count('abducted'))}
          </div>
          <p className="col-span-2 -mt-1 text-[11px] text-gray-500">Leave a count blank if it is not known; enter 0 if none.</p>
          {field('actors', 'Actors', text('actors', { placeholder: 'e.g. Armed bandits, Unknown gunmen' }), { wide: true })}
        </div>
      </section>

      {/* 3. Source */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">3. Source and confidence</h3>
        <div className="grid grid-cols-2 gap-2.5">
          {field('source', 'Source', text('source', { placeholder: 'e.g. Reuters, OAF field staff' }), { required: true })}
          {field('source_date', 'Source date', text('source_date', { type: 'date', max: todayIso() }))}
          {field('source_url', 'Source link', text('source_url', { type: 'url', placeholder: 'https://' }), { wide: true })}
          {field('confidence', 'Confidence', select('confidence', CONFIDENCE_OPTIONS), { required: true })}
          {field('verification_status', 'Verification', select('verification_status', VERIFICATION_OPTIONS), { required: true })}
        </div>
        {previewEventId && (
          <p className="text-[11px] text-gray-500">
            Will be saved as <span className="font-mono text-gray-300">{previewEventId}</span>, reported {todayIso()}.
          </p>
        )}
      </section>

      {submitError && (
        <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-start gap-2" role="alert">
          <AlertTriangle size={15} className="shrink-0 text-red-400 mt-0.5" />
          <span>{submitError}</span>
        </div>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-900/60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
      >
        {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
        Submit report
      </button>
    </form>
  );
}

/** Place search box (Google Places, Nigeria only) with a suggestion list. */
function PlaceSearch({ onSelect, onBusy }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const sessionRef = useRef(null);
  const timerRef = useRef(null);

  const runSearch = (text) => {
    clearTimeout(timerRef.current);
    if (text.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        if (!sessionRef.current) sessionRef.current = await newPlacesSession();
        const results = await searchPlaces(text, sessionRef.current);
        setSuggestions(results);
        setError(results.length ? null : 'No places found. Try adding the town or LGA.');
        setOpen(true);
      } catch (err) {
        setError(err.message);
      }
    }, 300);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const choose = async (s) => {
    setOpen(false);
    setQuery(s.text);
    onBusy?.('Getting the exact location…');
    try {
      onSelect(await resolvePlace(s.prediction));
    } catch (err) {
      setError(err.message);
    } finally {
      sessionRef.current = null;
      onBusy?.(null);
    }
  };

  // Fallback when Places is unavailable: plain address lookup on Enter
  const geocodeTyped = async () => {
    if (query.trim().length < 3) return;
    onBusy?.('Looking up the address…');
    try {
      onSelect(await geocodeAddress(query));
      setOpen(false);
    } catch (err) {
      setError(err.message);
    } finally {
      onBusy?.(null);
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center bg-gray-950 border border-gray-700 rounded-lg focus-within:border-green-500">
        <Search size={15} className="ml-3 text-gray-500 shrink-0" />
        <input
          type="search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setError(null); runSearch(e.target.value); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (suggestions[0] && open) choose(suggestions[0]);
              else geocodeTyped();
            }
          }}
          onFocus={() => suggestions.length && setOpen(true)}
          placeholder="Search a place, e.g. Kure Market Minna"
          className="w-full bg-transparent px-2.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none"
          aria-label="Search for the incident location"
        />
      </div>
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden" role="listbox">
          {suggestions.map(s => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => choose(s)}
                className="place-suggestion w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-800 flex items-start gap-2"
              >
                <MapPin size={14} className="mt-0.5 shrink-0 text-green-400" /> {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-[11px] text-yellow-300 mt-1">{error}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk upload
// ---------------------------------------------------------------------------

function downloadTemplate() {
  const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'security_incidents_template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function BulkUpload({ email, columns, states, existingEventIds, onSubmitted, onClose }) {
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState(null);
  const [progress, setProgress] = useState(null);
  const [rows, setRows] = useState(null); // [{ line, values, record, errors, notes }]
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [savedCount, setSavedCount] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = async (file) => {
    setFileError(null);
    setSubmitError(null);
    setRows(null);
    setSavedCount(null);
    setFileName(file.name);
    if (!/\.csv$/i.test(file.name)) {
      setFileError('Please upload a .csv file. In Excel or Google Sheets use File → Save as / Download → CSV.');
      return;
    }

    const parsed = readIncidentCsv(await file.text());
    if (parsed.missingColumns.length) {
      setFileError(`The file is missing these columns: ${parsed.missingColumns.join(', ')}. Download the template to get the right structure.`);
      return;
    }
    if (parsed.rows.length === 0) {
      setFileError('No incidents found in the file (the example row is ignored).');
      return;
    }

    // Look up missing coordinates or address fields so every row is placed precisely
    const prepared = [];
    for (const [i, row] of parsed.rows.entries()) {
      setProgress(`Checking row ${i + 1} of ${parsed.rows.length}…`);
      const values = { ...row.values };
      const notes = [];
      const hasCoords = String(values.latitude || '').trim() && String(values.longitude || '').trim() && !/^null$/i.test(values.latitude);
      try {
        if (!hasCoords) {
          const query = [values.location, values.lga, values.state, 'Nigeria'].filter(v => v && !/^null$/i.test(v)).join(', ');
          if (query.split(',').length > 1) {
            const found = await geocodeAddress(query);
            values.latitude = found.lat.toFixed(6);
            values.longitude = found.lng.toFixed(6);
            if (!values.lga || /^null$/i.test(values.lga)) values.lga = found.lga;
            notes.push(found.precise ? 'Coordinates found from location' : 'Approximate coordinates (area centre): check them');
          }
        } else if (!values.state || !values.lga || /^null$/i.test(values.lga)) {
          const found = await reverseGeocode(parseFloat(values.latitude), parseFloat(values.longitude));
          if (!values.state) values.state = found.state;
          if (!values.lga || /^null$/i.test(values.lga)) values.lga = found.lga;
          if (!values.location) values.location = found.location;
          notes.push('State/LGA filled from coordinates');
        }
      } catch {
        notes.push('Location lookup failed');
      }
      prepared.push({ ...row, values, notes });
    }

    const takenIds = new Set(existingEventIds);
    setRows(prepared.map(row => ({ ...row, ...buildIncidentRecord(row.values, { operatingStates: states, takenIds, columns }) })));
    setProgress(null);
  };

  const validRows = rows?.filter(r => r.record) || [];
  const invalidRows = rows?.filter(r => !r.record) || [];

  const submit = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const saved = await submitIncidentReports(validRows.map(r => r.record), email);
      setSavedCount(saved.length);
      onSubmitted?.(saved);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (savedCount !== null) {
    return (
      <div className="p-6 space-y-4 text-center">
        <CheckCircle2 size={44} className="mx-auto text-green-400" />
        <div>
          <p className="text-lg font-bold text-white">{savedCount} incident{savedCount === 1 ? '' : 's'} added</p>
          {invalidRows.length > 0 && (
            <p className="text-sm text-yellow-200 mt-1">{invalidRows.length} row{invalidRows.length === 1 ? ' was' : 's were'} skipped. Fix {invalidRows.length === 1 ? 'it' : 'them'} in the file and upload again.</p>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setRows(null); setSavedCount(null); setFileName(''); }} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-sm font-medium">
            Upload another file
          </button>
          <button onClick={onClose} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium">
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar text-sm">
      <section className="bg-gray-800/40 border border-gray-700/70 rounded-xl p-3.5 space-y-2.5">
        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">1. Download the template</h3>
        <p className="text-xs text-gray-300 leading-relaxed">
          One row per incident, using the same columns as the incident table. Open it in Excel or Google Sheets, replace the example row, and save as CSV.
        </p>
        <button
          type="button"
          onClick={downloadTemplate}
          className="w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 bg-gray-900 border border-gray-600 text-white hover:border-green-500"
        >
          <Download size={15} /> Download template (.csv)
        </button>
        <details className="text-xs text-gray-400">
          <summary className="cursor-pointer text-gray-300 hover:text-white">How to fill it in</summary>
          <ul className="mt-2 space-y-1 list-disc list-inside leading-relaxed">
            <li><b className="text-gray-200">Required:</b> date, state, lga, event_type, severity, description, source, confidence, verification_status.</li>
            <li><b className="text-gray-200">Coordinates:</b> fill latitude/longitude, or leave them blank and give a precise location, and they are looked up for you.</li>
            <li><b className="text-gray-200">state:</b> {states.join(', ')}.</li>
            <li><b className="text-gray-200">severity:</b> {SEVERITY_OPTIONS.join(', ')}. <b className="text-gray-200">confidence:</b> {CONFIDENCE_OPTIONS.join(', ')}.</li>
            <li><b className="text-gray-200">verification_status:</b> {VERIFICATION_OPTIONS.join(', ')}.</li>
            <li><b className="text-gray-200">Dates:</b> YYYY-MM-DD (or DD/MM/YYYY).</li>
            <li><b className="text-gray-200">Counts:</b> leave blank if unknown, 0 if none.</li>
            <li><b className="text-gray-200">event_id / reported_date:</b> leave blank; they are filled in automatically.</li>
          </ul>
        </details>
      </section>

      <section className="space-y-2.5">
        <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">2. Upload the completed file</h3>
        <label
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) processFile(file);
          }}
          className={`block border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
            isDragging ? 'border-green-500 bg-green-500/10' : 'border-gray-700 hover:border-gray-500'
          }`}
        >
          <Upload size={22} className="mx-auto text-gray-400" />
          <p className="mt-1.5 text-sm text-white font-medium">{fileName || 'Choose a CSV file or drop it here'}</p>
          <p className="text-[11px] text-gray-500">Rows are checked before anything is saved</p>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            aria-label="Upload incident CSV"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) processFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {progress && <p className="text-xs text-gray-300 flex items-center gap-2"><Loader2 size={13} className="animate-spin" /> {progress}</p>}
        {fileError && (
          <p className="text-xs text-red-300 flex items-start gap-1.5" role="alert"><AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-400" /> {fileError}</p>
        )}
      </section>

      {rows && (
        <section className="space-y-2.5">
          <h3 className="text-xs font-semibold text-green-400 uppercase tracking-wider">3. Review and add</h3>
          <p className="text-xs text-gray-300">
            <span className="text-green-400 font-semibold">{validRows.length} ready</span>
            {invalidRows.length > 0 && <>, <span className="text-red-400 font-semibold">{invalidRows.length} with errors</span> (they will be skipped)</>}.
          </p>
          <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1 custom-scrollbar">
            {rows.map(row => (
              <li key={row.line} className={`upload-row rounded-lg border p-2.5 text-xs ${row.record ? 'border-gray-700 bg-gray-800/40' : 'border-red-500/40 bg-red-500/10'}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-white truncate">
                    Row {row.line}: {row.values.event_type || 'Incident'}, {[row.values.lga, row.values.state].filter(Boolean).join(', ') || 'no location'}
                  </span>
                  {row.record
                    ? <span className="text-green-400 shrink-0 flex items-center gap-1"><CheckCircle2 size={12} /> Ready</span>
                    : <span className="text-red-400 shrink-0 flex items-center gap-1"><AlertTriangle size={12} /> Error</span>}
                </div>
                {row.record && <p className="text-gray-500 mt-0.5 font-mono">{row.record.event_id} · {row.record.latitude}, {row.record.longitude}</p>}
                {row.notes.map(n => <p key={n} className="text-yellow-200/90 mt-0.5">{n}</p>)}
                {Object.values(row.errors).filter(Boolean).map(err => <p key={err} className="text-red-300 mt-0.5">{err}</p>)}
              </li>
            ))}
          </ul>

          {submitError && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-start gap-2" role="alert">
              <AlertTriangle size={15} className="shrink-0 text-red-400 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={isSubmitting || validRows.length === 0}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-900/60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Add {validRows.length} incident{validRows.length === 1 ? '' : 's'}
          </button>
        </section>
      )}
    </div>
  );
}
