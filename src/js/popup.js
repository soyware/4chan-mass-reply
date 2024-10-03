import {
  debugLog,
} from './misc';

import {
  settings,
} from './settings';

function handleWatermarkChange(element) {
  if (element.id !== 'watermark') return;

  const customReddit = document.getElementById('customReddit');
  customReddit.style.display = (element.value !== 'reddit' ? 'none' : '');
}

browser.storage.local.get(settings).then((localStorage) => {
  // init popup settings to local storage values
  const keys = Object.keys(localStorage);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];

    const element = document.getElementById(key);
    if (!element) {
      debugLog(`"${key}" setting not found on the popup`);
      continue;
    }

    if (element.type === 'checkbox') {
      element.checked = localStorage[key];
    } else {
      element.value = localStorage[key];
    }

    handleWatermarkChange(element);

    element.onchange = (event) => {
      const target = event.target;

      handleWatermarkChange(target);

      // set local storage values on popup settings change
      const value = (target.type === 'checkbox' ? target.checked : target.value);

      browser.storage.local.set({
        [target.id]: value,
      }).then(() => {
        debugLog(`Local storage: "${target.id}" set to "${value}"`);
      }, (error) => {
        debugLog(`Error setting local storage: ${error}`);
      });
    };
  }
});
