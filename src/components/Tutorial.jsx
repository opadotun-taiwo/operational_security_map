import React from 'react';
import { Joyride, STATUS } from 'react-joyride';

export default function Tutorial() {
  const [run, setRun] = React.useState(false);

  React.useEffect(() => {
    // Check if the user has seen the tutorial before
    const hasSeenTutorial = localStorage.getItem('hasSeenMapTutorial');
    if (!hasSeenTutorial) {
      // Small delay to let map load and render components
      setTimeout(() => setRun(true), 2000);
    }
  }, []);

  const handleJoyrideCallback = (data) => {
    const { status } = data;
    const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

    if (finishedStatuses.includes(status)) {
      setRun(false);
      localStorage.setItem('hasSeenMapTutorial', 'true');
    }
  };

  const steps = [
    {
      target: '.tutorial-step-1', // TopBar filters
      content: 'Welcome! Use these filters to narrow down incidents by severity, type, or date.',
      placement: 'bottom',
      disableBeacon: true,
    },
    {
      target: '.tutorial-step-2', // Map Clusters
      content: 'Click on a numbered cluster to see a list of all incidents in that area.',
      placement: 'right',
    },
    {
      target: '.tutorial-step-3', // Map Layers
      content: 'Use this panel to toggle map layers, such as heatmaps or proximity zones. You can also hide it when not needed.',
      placement: 'left',
    },
    {
      target: '.tutorial-step-4', // Reset View
      content: 'Lost? Click here at any time to reset your view to the default zoom and location.',
      placement: 'top',
    }
  ];

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous={true}
      scrollToFirstStep={false}
      showProgress={true}
      showSkipButton={true}
      callback={handleJoyrideCallback}
      styles={{
        options: {
          zIndex: 10000,
          primaryColor: '#3b82f6', // blue-500
          backgroundColor: '#1f2937', // gray-800
          textColor: '#f3f4f6', // gray-100
          arrowColor: '#1f2937',
        },
        buttonClose: {
          color: '#9ca3af', // gray-400
        },
        buttonNext: {
          backgroundColor: '#2563eb', // blue-600
        },
        buttonBack: {
          color: '#9ca3af',
        },
        tooltip: {
          borderRadius: '0.75rem',
          padding: '1.5rem',
        }
      }}
    />
  );
}
