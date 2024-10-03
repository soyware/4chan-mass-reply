import {
  debugLog,
  is4chanX,
  isKYMfilename,
  getFilenameElements,
} from './misc';

import {
  createQuotes,
} from './quotes';

import {
  saveFile,
  loadFile,
} from './store';

import {
  fileCompress,
  anonFile,
  drawWatermark,
  fakeFilename,
} from './file';

import {
  getBoard,
  getBoardInfo,
} from './board';

import {
  slideCaptcha,
} from './captcha';

import {
  settings,
} from './settings';

const isMobile = (window.screen.width <= 480);

const boardInfo = getBoardInfo();

function createFileList(...files) {
  const fileList = (Array.isArray(files[0]) ? files[0] : files);

  const dt = new DataTransfer();

  for (let i = 0; i < fileList.length; ++i) {
    if (!(fileList[i] instanceof File)) {
      debugLog('createFileList expected File arguments');
      continue;
    }
    dt.items.add(fileList[i]);
  }

  return dt.files;
}

let loadedFileQuality = null;
let ignoreFileChange = false;

function fileChanged(event) {
  if (ignoreFileChange) {
    ignoreFileChange = false;
    return;
  }

  const target = event.target;
  if (!target.files.length) return;

  fileCompress(
    target.files[0],
    boardInfo.maxFileSize,
    loadedFileQuality || 0.9,
  ).then((compressed) => {
    // undefined when unable to fit within file size limit
    if (!compressed) return;

    target.files = createFileList(compressed.file);

    const quality = compressed.quality;

    // we saved a file which meets file size limits on one board
    // but it might not meet on the other
    if (settings.persistentFile && (loadedFileQuality !== quality)) {
      saveFile(target.files[0], quality);
    }

    loadedFileQuality = null;

    if (settings.fakeFilename !== 'off') {
      const fakeFilenameFile = fakeFilename(target.files[0], settings.fakeFilename);
      target.files = createFileList(fakeFilenameFile);
    }

    let anonPromise = Promise.resolve();

    if (settings.changeFileHash) {
      anonPromise = new Promise((resolve) => {
        anonFile(target.files[0], quality).then((hashFile) => {
          target.files = createFileList(hashFile);
          resolve();
        });
      });
    }

    anonPromise.then(() => {
      let watermarkPromise = Promise.resolve();

      if (settings.watermark !== 'off') {
        watermarkPromise = new Promise((resolve) => {
          drawWatermark(
            target.files[0],
            settings.watermark,
            settings.subreddit,
            settings.username,
            quality,
          ).then((watermarkedFile) => {
            if (watermarkedFile) {
              target.files = createFileList(watermarkedFile);
            }
            resolve();
          });
        });
      }

      watermarkPromise.then(() => {
        // check if the file size meets the limit after changing a pixel and drawing a watermark
        fileCompress(target.files[0], boardInfo.maxFileSize, quality).then((compressed2) => {
          if (!compressed2) return;

          target.files = createFileList(compressed2.file);

          // let the other listeners know we've updated the file
          ignoreFileChange = true;

          setTimeout(() => {
            ignoreFileChange = false;
          }, 1000);

          target.dispatchEvent(new Event('change', { bubbles: true }));
        });
      });
    });
  });
}

function gotFileInput(element) {
  // useCapture=true so it gets called before 4chanX's "change" listener
  // because 4chanX empties fileInput.files
  element.addEventListener('change', fileChanged, is4chanX);

  if (settings.persistentFile) {
    loadFile().then((loaded) => {
      loadedFileQuality = loaded.quality;
      element.files = createFileList(loaded.file);
      // let the other listeners know we've updated the file
      element.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
}

function bypassWordfilter(text) {
  const board = getBoard();
  const wordFilters = boardInfo.wordFilters;

  for (let i = 0; i < wordFilters.length; ++i) {
    const pattern = wordFilters[i];

    text = text.replace(pattern, (match) => {
      // r9k doesn't allow non ascii
      if (board !== 'r9k') {
        // check if we have a homoglyph
        const replacements = {
          0: 'o',
          a: 'ä',
          B: 'Β',
          b: 'Ь',
          c: 'ϲ',
          C: 'Ϲ',
          d: 'ԁ',
          F: 'Ϝ',
          g: 'ɡ',
          H: 'Η',
          h: 'ℎ',
          k: 'ƙ',
          K: 'Κ',
          M: 'Μ',
          N: 'Ν',
          n: 'ᥒ',
          O: 'ⵔ',
          o: '𐐬',
          p: 'ρ',
          S: 'Տ',
          s: '𐑈',
          Y: 'Ү',
        };

        for (let j = match.length - 1; j >= 0; --j) {
          const letter = match[j];
          if (!replacements[letter]) continue;

          const homoglyphed = match.slice(0, j) + replacements[letter] + match.slice(j + 1);

          return homoglyphed;
        }
      }

      // check if the filter is a phrase and can be bypassed by
      // inserting apostrophe before last word
      if (match.split(' ').length > 1) {
        const lastSpaceIndex = match.lastIndexOf(' ');
        const addedSymbol = `${match.slice(0, lastSpaceIndex)} '${match.slice(lastSpaceIndex + 1)}`;

        pattern.lastIndex = 0;
        if (!pattern.test(addedSymbol)) {
          return addedSymbol;
        }
      }

      // check if the filter can be bypassed by changing the case of the last letter
      if (!pattern.ignoreCase) {
        let lastLetter = match.slice(-1);

        if (lastLetter >= 'a' && lastLetter <= 'z') lastLetter = lastLetter.toUpperCase();
        else if (lastLetter >= 'A' && lastLetter <= 'Z') lastLetter = lastLetter.toLowerCase();

        const caseChanged = match.slice(0, -1) + lastLetter;

        pattern.lastIndex = 0;
        if (!pattern.test(caseChanged)) {
          return caseChanged;
        }
      }

      // check if the filter can be bypassed by an underscore prefix
      const prefixed = `_${match}`;

      pattern.lastIndex = 0;
      if (!pattern.test(prefixed)) {
        return prefixed;
      }

      return match;
    });
  }
  return text;
}

function commentChanged(event) {
  if (settings.bypassWordfilter) {
    const element = event.target;
    element.value = bypassWordfilter(element.value);
  }
}

function createButton(parentElement, label, title, listener) {
  const btn = document.createElement('span');
  btn.classList.add('mrBtn');
  btn.textContent = label;
  btn.title = title;

  parentElement.appendChild(btn);

  btn.addEventListener('click', listener);
}

function addQuotesText(element, action) {
  if (element.value && element.value.slice(-1) !== '\n') element.value += '\n';
  element.value += createQuotes(
    action,
    settings.quoteFormat,
    settings.quoteBottom,
    boardInfo.maxLines,
    boardInfo.characterLimit,
  );
  element.scrollTop = element.scrollHeight;
  element.focus();
}

function deleteCookie() {
  debugLog('Deleting 4chan_pass cookie');

  browser.runtime.sendMessage({
    message: 'deleteCookie',
    cookieDomain: 'https://4chan.org/',
    cookieName: '4chan_pass',
  });

  browser.runtime.sendMessage({
    message: 'deleteCookie',
    cookieDomain: 'https://4channel.org/',
    cookieName: '4chan_pass',
  });
}

function gotTextArea(element) {
  element.classList.add('comtxt');
  element.addEventListener('change', commentChanged);

  // build UI after comment textarea
  const div = document.createElement('div');

  createButton(div, '🗑️', 'Clear Text', () => {
    element.value = '';
    element.focus();
  });

  createButton(div, '📋', 'Paste from Clipboard', () => {
    navigator.clipboard.readText().then((text) => {
      if (element.value && element.value.slice(-1) !== '\n') element.value += '\n';
      element.value += text;
      element.scrollTop = element.scrollHeight;
      element.focus();
    });
  });

  createButton(div, '🍪', 'Delete Cookie', () => {
    deleteCookie();
  });

  createButton(div, '⚔️', 'Mass Reply', () => {
    addQuotesText(element, 'regular');
  });

  createButton(div, '😮', 'Soyquote', () => {
    element.value = element.value.replace(/>>(\d+)\s*/g, (match, group1, offset, string) => {
      const message = document.getElementById(`m${group1}`);
      if (!message) return match;

      let replacement = (offset && string.charAt(offset - 1) !== '\n') ? '\n' : '';
      replacement += `>${message.innerText.replaceAll('\n', '\n>')}`;
      if ((offset + match.length + 1) < string.length) replacement += '\n';

      return replacement;
    });
    element.scrollTop = element.scrollHeight;
    element.focus();
  });

  createButton(div, '🖼️', 'Soyquote Filename', () => {
    element.value = element.value.replace(/>>(\d+)\s*/g, (match, group1) => {
      const fileText = document.getElementById(`fT${group1}`);
      if (!fileText) return match;

      if (is4chanX) {
        const fileTextA = fileText.children[0].children[0];
        const fnfull = fileTextA.getElementsByClassName('fnfull');
        return `>${(fnfull.length ? fnfull[0] : fileTextA).textContent}\n`;
      }

      const fileName = fileText.children[0];
      return `>${fileName.title ? fileName.title : fileName.textContent}\n`;
    });
    element.scrollTop = element.scrollHeight;
    element.focus();
  });

  createButton(div, '☝️', "Check 'em", () => {
    addQuotesText(element, 'dubs');
  });

  createButton(div, '🏷️', 'Spoof Filename', () => {
    const input = element.parentElement.parentElement.parentElement.querySelector('[type=file]');
    if (input && input.files.length) {
      const file = fakeFilename(input.files[0], (settings.fakeFilename !== 'off' ? settings.fakeFilename : 'unix'));
      input.files = createFileList(file);
    }
  });

  createButton(div, '#️⃣', 'Change File Hash', () => {
    const input = element.parentElement.parentElement.parentElement.querySelector('[type=file]');
    if (input && input.files.length) {
      anonFile(input.files[0]).then((anonedFile) => {
        input.files = createFileList(anonedFile);
      });
    }
  });

  if (/^\/[^/]+\/thread/.test(window.location.pathname)) {
    if (boardInfo.hasUserIDs) {
      createButton(div, '🏆', 'Rankings', () => {
        addQuotesText(element, 'rankings');
      });
      // this emoji doesn't work on win 7
      createButton(div, '1️⃣', 'Quote 1pbtIDs', () => {
        addQuotesText(element, '1pbtid');
      });
    }

    if (boardInfo.hasBoardFlags) {
      createButton(div, '🏁', 'Quote Memeflags', () => {
        addQuotesText(element, 'memeflags');
      });
    }

    createButton(div, '💩', 'KYM', () => {
      addQuotesText(element, 'kym');
    });
  }

  const isOriginalForm = (element.parentElement.tagName === 'TD');

  if (isOriginalForm) {
    element.after(div);
  } else {
    element.parentElement.after(div);
  }
}

function createOptionRadio(parentElement, option) {
  const span = document.createElement('span');
  span.style.marginRight = '3px';

  const input = document.createElement('input');
  input.type = 'radio';
  // group radio buttons + will send the value when not 4chanx quick reply
  input.name = 'email';
  input.value = option;
  input.style.margin = '3px';
  input.style.verticalAlign = 'middle';

  // 4chanx gets email value from it's element
  if (is4chanX) {
    // input -> label -> span -> span -> div
    input.setAttribute('onchange', `(() => {
      const options =
        this
        .parentElement
        .parentElement
        .parentElement
        .parentElement
        .querySelector('input[name=email]:not([type=radio])');

      if (options) options.value = '${option}';
    })()`);
  }

  const label = document.createElement('label');
  label.appendChild(input);
  label.innerHTML += option;

  span.appendChild(label);
  parentElement.appendChild(span);
}

function gotOptionsField(element) {
  if (!settings.optionRadios) return;

  element.style.display = 'none';
  element.disabled = true; // don't send the original email field

  const span = document.createElement('span');

  span.title = 'Shift + Click to uncheck';

  span.setAttribute('onmousedown', `((event) => {
    if (event.shiftKey) {
      event.preventDefault();
    }
  })(event)`);

  span.setAttribute('onclick', `((event) => {
    if (event.shiftKey) {
      const radios = this.querySelectorAll('input[type=radio]');
      radios.forEach((radio) => {
        radio.checked = false;
      });
    }
  })(event)`);

  createOptionRadio(span, 'sage');
  createOptionRadio(span, 'fortune');
  createOptionRadio(span, 'since4pass');

  element.parentElement.appendChild(span);
}

function highlightKym(element) {
  const filenameElems = getFilenameElements(element);

  for (let i = 0; i < filenameElems.length; ++i) {
    const filename = filenameElems[i].textContent;
    if (!isKYMfilename(filename)) continue;

    const highlightColor = '#FDFF47';

    if (isMobile) {
      const fileDiv = filenameElems[i].parentElement.parentElement;
      if (!fileDiv) continue;
      const mFileInfo = fileDiv.getElementsByClassName('mFileInfo');
      if (mFileInfo.length) {
        mFileInfo[0].style.backgroundColor = highlightColor;
      }
    } else {
      filenameElems[i].style.backgroundColor = highlightColor;
    }
  }
}

function getFields(element) {
  const selectors = [
    {
      selector: 'input[type=file]',
      debugMsg: 'Found file input: ',
      callback: gotFileInput,
    }, {
      // 4chan's extension builds quick post from original form
      selector: 'input[name=email]:not([type=radio]):not(#qrEmail)',
      debugMsg: 'Found options field: ',
      callback: gotOptionsField,
    }, {
      selector: 'textarea[name=com], textarea[data-name=com]',
      debugMsg: 'Found comment textarea: ',
      callback: gotTextArea,
    },
  ];

  selectors.forEach(({ selector, debugMsg, callback }) => {
    if (element.matches(selector)) {
      debugLog(debugMsg, element);
      callback(element);
    }

    const matches = element.querySelectorAll(selector);

    matches.forEach((match) => {
      debugLog(debugMsg, match);
      callback(match);
    });
  });
}

function mutationCallback(mutations) {
  mutations.forEach((mutation) => {
    // detect Get Captcha button text changing from Loading
    if (settings.slideCaptcha
      && mutation.target
      && mutation.target.id === 't-load'
      && mutation.removedNodes.length
      && mutation.removedNodes[0].data === 'Loading'
    ) {
      const captchaRoot = mutation.target.parentElement;
      if (captchaRoot) {
        const fg = captchaRoot.querySelector('#t-fg');
        const bg = captchaRoot.querySelector('#t-bg');
        const slider = captchaRoot.querySelector('#t-slider');
        const resp = captchaRoot.querySelector('#t-resp');
        slideCaptcha(fg, bg, slider, resp);
      }
      return;
    }

    if (settings.autoDeleteCookie
      && mutation.target
      && (is4chanX
        ? (mutation.target.id === 'notifications' && mutation.addedNodes.length)
        : (mutation.target.id === 'qrError' && mutation.target.style.display !== 'none'))
    ) {
      const text = mutation.target.textContent;
      if (text.includes('Error: Ban evasion') || text.includes('temporarily blocked')) {
        deleteCookie();
      }
      return;
    }

    // watch for quick reply box and new posts
    const addedNodes = mutation.addedNodes;
    for (let i = 0; i < addedNodes.length; ++i) {
      const addedNode = addedNodes[i];
      if (addedNode.nodeType !== Node.ELEMENT_NODE) continue;

      if (addedNode.classList.contains('postContainer')) {
        if (settings.highlightKym) {
          highlightKym(addedNode);
        }
      } else {
        getFields(addedNode);
      }
    }
  });
}

browser.storage.local.onChanged.addListener((changes) => {
  const keys = Object.keys(changes);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    settings[key] = changes[key].newValue;
  }
});

// init
browser.storage.local.get(settings).then((localStorage) => {
  const keys = Object.keys(localStorage);
  for (let i = 0; i < keys.length; ++i) {
    const key = keys[i];
    settings[key] = localStorage[key];
  }

  if (settings.autoDeleteCookie && /^\/[^/]+\/post$/.test(window.location.pathname)) {
    const errmsg = document.getElementById('errmsg');
    if (errmsg) {
      const text = errmsg.textContent;
      if (text.includes('Error: Ban evasion') || text.includes('temporarily blocked')) {
        deleteCookie();
      }
      return;
    }
  }

  if (settings.highlightKym) {
    highlightKym(document.body);
  }

  getFields(document.body);

  const observer = new MutationObserver(mutationCallback);

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}, (error) => {
  debugLog(`Error getting local storage: ${error}`);
});
