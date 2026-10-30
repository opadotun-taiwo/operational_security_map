import React from 'react';
import { Joyride, STATUS } from 'react-joyride';

function hasSeenTutorial() {
  try {
    return Boolean(localStorage.getItem('hasSeenMapTutorial'));
  } catch {
    return true;
  }
}

/**
 * Guided tour. Runs automatically on a first visit; `restartToken` changes replay it.
 */
export default function Tutorial({ restartToken = 0 }) {
  const [run, setRun] = React.useState(false);

  React.useEffect(() => {
    const isReplay = restartToken > 0;
    if (!isReplay && hasSeenTutorial()) return undefined;
    // On first visit wait for the map and its components to render
    const timer = setTimeout(() => setRun(true), isReplay ? 0 : 2000);
    return () => clearTimeout(timer);
  }, [restartToken]);

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      try {
        localStorage.setItem('hasSeenMapTutorial', 'true');
      } catch {
        // Storage unavailable (private mode); the tour may show again next visit
      }
    }
  };

  const steps = [
    {
      target: '.tutorial-step-1', // TopBar filters
      content: 'Narrow down incidents by severity, type, verification, state or date.',
      placement: 'bottom',
    },
    {
      target: '.tutorial-hub-scope',
      content: 'To keep the map readable, only incidents near your operational hubs are shown. Widen the range here, or choose "All incidents".',
      placement: 'bottom',
    },
    {
      target: '.tutorial-map',
      content: 'Green numbered circles group nearby incidents. Click one to list them and zoom in. Click a single dot for full details, or a hub to see its 5 km alert zone.',
      placement: 'center',
    },
    {
      target: '.tutorial-route',
      content: 'Plan a trip between hubs or any coordinates. Up to three driving routes are compared, labelled A, B and C on the map, with the safest and fastest highlighted.',
      placement: 'bottom',
    },
    {
      target: '.tutorial-step-3', // Map Layers
      content: 'Turn map layers on or off, such as hub areas or the hotspot heatmap, and read the legend. Click this button to hide the panel.',
      placement: 'left',
    },
    {
      target: '.tutorial-step-4', // Reset View
      content: 'Lost? Click here at any time to return to the default view of Nigeria.',
      placement: 'top',
    }
  ];

  // react-joyride v3 API: onEvent / options (v2's callback, showSkipButton and
  // disableBeacon are ignored, which left the tour stuck as an unopened beacon)
  return (
    <Joyride
      steps={steps}
      run={run}
      continuous={true}
      scrollToFirstStep={false}
      onEvent={handleJoyrideCallback}
      options={{
        skipBeacon: true,
        showProgress: true,
        buttons: ['back', 'skip', 'primary'],
        zIndex: 10000,
        primaryColor: '#16a34a', // green-600
        backgroundColor: '#1f2937', // gray-800
        textColor: '#f3f4f6', // gray-100
        arrowColor: '#1f2937',
        overlayColor: 'rgba(3, 7, 18, 0.6)',
        width: 340
      }}
    />
  );
}
