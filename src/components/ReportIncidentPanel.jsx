import React, { useEffect, useMemo, useState } from 'react';
import { X, Lock, Crosshair, CheckCircle2, AlertTriangle, Loader2, FilePlus2, Home } from 'lucide-react';
import {
  isAuthorizedReporter,
  fetchIncidentTableShape,
  describeFormFields,
  buildIncidentRecord,
  submitIncidentReport,
  normalizeEmail
} from '../services/incidentReports';
import { nearestHub } from '../utils/routeComparison';

const SESSION_KEY = 'oneSecureReporter';

function readSessionEmail() {
  try {
    return sessionStorage.getItem(SESSION_KEY) || '';
  } catch {
    return '';
  }
}

function initialValues(fields) {
  const values = {};
  for (const f of fields) values[f.key] = f.defaultValue ?? '';
  values.date = new Date().toISOString().slice(0, 10);
  return values;
}

const inputClass = (hasError) =>
  `w-full bg-gray-950 border rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 ${
    hasError ? 'border-red-500 focus:ring-red-500' : 'border-gray-700 focus:border-green-500 focus:ring-green-500'
  }`;

/**
 * Side panel for approved staff to add an incident to security_events.
 */
export default function ReportIncidentPanel({
  onClose,
  hubs = [],
  states = [],
  eventTypes = [],
  isPickingLocation,
  onStartPicking,
  pickedLocation,
  onSubmitted
}) {
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [emailError, setEmailError] = useState(null);
  const [isCheckingEmail, setIsCheckingEmail] = useState(false);

  const [shape, setShape] = useState({ columns: null, sample: null, loaded: false });
  const { fields, extraColumns } = useMemo(() => describeFormFields(shape.columns), [shape.columns]);
  const [values, setValues] = useState(() => initialValues(describeFormFields(null).fields));
  const [errors, setErrors] = useState({});
  const [submitError, setSubmitError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null);

  // Re-use an email already verified in this browser session
  useEffect(() => {
    const saved = readSessionEmail();
    if (!saved) return;
    isAuthorizedReporter(saved).then(ok => ok && setVerifiedEmail(saved));
  }, []);

  // Learn the incident table's columns once the reporter is verified
  useEffect(() => {
    if (!verifiedEmail) return;
    let cancelled = false;
    fetchIncidentTableShape()
      .then(result => !cancelled && setShape({ ...result, loaded: true }))
      .catch(() => !cancelled && setShape({ columns: null, sample: null, loaded: true }));
    return () => { cancelled = true; };
  }, [verifiedEmail]);

  // Coordinates chosen by clicking the map
  const [lastPick, setLastPick] = useState(null);
  if (pickedLocation && pickedLocation !== lastPick) {
    setLastPick(pickedLocation);
    setValues(v => ({ ...v, latitude: pickedLocation.lat.toFixed(5), longitude: pickedLocation.lng.toFixed(5) }));
    setErrors(e => ({ ...e, latitude: undefined, longitude: undefined }));
  }

  const hubHint = useMemo(() => {
    const lat = parseFloat(values.latitude);
    const lng = parseFloat(values.longitude);
    if (isNaN(lat) || isNaN(lng) || hubs.length === 0) return null;
    return nearestHub({ latitude: lat, longitude: lng }, hubs);
  }, [values.latitude, values.longitude, hubs]);

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

  const setValue = (key, value) => {
    setValues(v => ({ ...v, [key]: value }));
    if (errors[key]) setErrors(e => ({ ...e, [key]: undefined }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError(null);
    const { record, errors: validation } = buildIncidentRecord(values, {
      columns: shape.columns,
      sample: shape.sample,
      reporterEmail: verifiedEmail
    });
    setErrors(validation);
    if (!record) {
      setSubmitError('Please fix the highlighted fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const saved = await submitIncidentReport(record, verifiedEmail);
      setSubmitted(saved || record);
      onSubmitted?.(saved || record);
    } catch (err) {
      setSubmitError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnother = () => {
    setValues(initialValues(fields));
    setErrors({});
    setSubmitted(null);
    setSubmitError(null);
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
    <div className="absolute top-0 right-0 h-full w-full sm:w-[420px] bg-gray-900 shadow-2xl border-l border-gray-800 z-50 flex flex-col">
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
      ) : submitted ? (
        <div className="p-6 space-y-4 text-center">
          <CheckCircle2 size={44} className="mx-auto text-green-400" />
          <div>
            <p className="text-lg font-bold text-white">Report added</p>
            <p className="text-sm text-gray-400 mt-1">
              {submitted.event_type} in {submitted.lga ? `${submitted.lga}, ` : ''}{submitted.state} is now on the map.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAnother} className="flex-1 py-2.5 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700 text-sm font-medium">
              Report another
            </button>
            <button onClick={onClose} className="flex-1 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium">
              Done
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Fields marked <span className="text-red-400">*</span> are required.</span>
            <button type="button" onClick={signOut} className="text-gray-400 hover:text-white underline underline-offset-2">
              Use a different email
            </button>
          </div>

          {!shape.loaded && (
            <p className="text-xs text-gray-400 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Checking the incident table…
            </p>
          )}

          {/* Location */}
          <fieldset className="bg-gray-800/40 border border-gray-700/70 rounded-xl p-3 space-y-2.5">
            <legend className="px-1 text-xs font-semibold text-green-400">Where did it happen? <span className="text-red-400">*</span></legend>
            <button
              type="button"
              onClick={onStartPicking}
              className={`w-full py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 border transition-colors ${
                isPickingLocation
                  ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-200 animate-pulse'
                  : 'bg-gray-900 border-gray-600 text-white hover:border-green-500'
              }`}
            >
              <Crosshair size={16} />
              {isPickingLocation ? 'Click the incident location on the map…' : 'Pick location on the map'}
            </button>
            <div className="grid grid-cols-2 gap-2">
              {['latitude', 'longitude'].map(key => (
                <label key={key} className="block space-y-1">
                  <span className="text-[11px] text-gray-400 capitalize">{key}</span>
                  <input
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={values[key] ?? ''}
                    onChange={(e) => setValue(key, e.target.value)}
                    placeholder={key === 'latitude' ? 'e.g. 9.6139' : 'e.g. 6.5569'}
                    className={inputClass(Boolean(errors[key]))}
                  />
                </label>
              ))}
            </div>
            {(errors.latitude || errors.longitude) && (
              <p className="text-xs text-red-300">{errors.latitude || errors.longitude}</p>
            )}
            {hubHint?.nearestHubName && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <Home size={12} /> {hubHint.nearestHubKm} km from {hubHint.nearestHubName} hub
              </p>
            )}
          </fieldset>

          <datalist id="report-states">
            {states.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="report-eventTypes">
            {eventTypes.map(t => <option key={t} value={t} />)}
          </datalist>

          <div className="grid grid-cols-2 gap-3">
            {fields.filter(f => f.key !== 'latitude' && f.key !== 'longitude').map(field => {
              const wide = field.type === 'textarea' || ['location', 'source_url', 'actors', 'event_type'].includes(field.key);
              const hasError = Boolean(errors[field.key]);
              return (
                <label key={field.key} className={`block space-y-1 ${wide ? 'col-span-2' : ''}`}>
                  <span className="text-xs font-medium text-gray-300">
                    {field.label} {field.required && <span className="text-red-400">*</span>}
                  </span>
                  {field.type === 'select' ? (
                    <select
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      className={inputClass(hasError)}
                    >
                      {!field.defaultValue && <option value="">Select…</option>}
                      {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      rows={4}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className={inputClass(hasError)}
                    />
                  ) : (
                    <input
                      type={field.type === 'integer' ? 'number' : field.type}
                      min={field.type === 'integer' ? 0 : undefined}
                      step={field.type === 'integer' ? 1 : field.step}
                      max={field.type === 'date' ? new Date().toISOString().slice(0, 10) : undefined}
                      list={field.list ? `report-${field.list}` : undefined}
                      value={values[field.key] ?? ''}
                      onChange={(e) => setValue(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className={inputClass(hasError)}
                    />
                  )}
                  {hasError && <span className="block text-[11px] text-red-300">{errors[field.key]}</span>}
                </label>
              );
            })}

            {extraColumns.map(column => (
              <label key={column} className="block space-y-1 col-span-2">
                <span className="text-xs font-medium text-gray-300">{column.replace(/_/g, ' ')}</span>
                <input
                  type={typeof shape.sample?.[column] === 'number' ? 'number' : 'text'}
                  value={values[column] ?? ''}
                  onChange={(e) => setValue(column, e.target.value)}
                  className={inputClass(Boolean(errors[column]))}
                />
                {errors[column] && <span className="block text-[11px] text-red-300">{errors[column]}</span>}
              </label>
            ))}
          </div>

          {submitError && (
            <div className="p-3 bg-red-500/15 border border-red-500/30 rounded-lg text-red-300 text-xs flex items-start gap-2" role="alert">
              <AlertTriangle size={15} className="shrink-0 text-red-400 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !shape.loaded}
            className="w-full py-3 bg-red-600 hover:bg-red-500 disabled:bg-red-900/60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
          >
            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <FilePlus2 size={16} />}
            Submit report
          </button>
        </form>
      )}
    </div>
  );
}
