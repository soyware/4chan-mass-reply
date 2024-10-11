import {
  debugLog,
} from './misc';

export function getBoard() {
  const match = window.location.href.match(/(?<=boards\.4chan(?:nel)?\.org\/)[a-z0-9]+(?=\/)/);
  return match ? match[0] : null;
}

export function getBoardInfo() {
  let characterLimit = 2000;
  let maxFileSize = 4194304;
  let hasUserIDs = false;
  const hasBoardFlags = (!!document.getElementsByClassName('flagSelector').length);

  let maxLines = 101;
  const isNsfw = document.body.classList.contains('nws');

  // catalog page doesn't have maxLines defined
  if (isNsfw) {
    const board = getBoard();
    if (board === 'b' || board === 'bant') {
      maxLines = 51;
    } else {
      maxLines = 71;
    }
  }

  function handleMessage(event) {
    const detail = event.detail;
    if (detail) {
      debugLog('Received board info: ', detail);
      if (detail.comlen) characterLimit = detail.comlen;
      if (detail.maxFilesize) maxFileSize = detail.maxFilesize;
      if (detail.maxLines) maxLines = (detail.maxLines + 1);
      if (detail.user_ids) hasUserIDs = detail.user_ids;
    }
  }

  window.addEventListener('mrBoardInfoEvent', handleMessage, {
    once: true,
  });

  const script = document.createElement('script');

  script.textContent = `
    window.dispatchEvent(new CustomEvent('mrBoardInfoEvent', {
      detail: {
        comlen: window.comlen,
        maxFilesize: window.maxFilesize,
        maxLines: window.maxLines,
        user_ids: window.user_ids,
      }
    }));
  `;

  document.head.appendChild(script);
  script.remove();

  let wordFilters = [
    /hi reddit/gi,
    /hello reddit/gi,
    /back to reddit/gi,
    /literally reddit/gi,
    /3004 Norfolk Dr/gi,
    /3004 Norfolƙ Dr/gi, // seems like they filtered with a homoglyph (ƙ)
    /3004 Νorfolk Dr/gi, // (Ν)
    /CUCK/g,
    /\btbh\b/g, // "tbH" and "Tbh" isn't filtered
    /\bTBH\b/g,
    /\bsmh\b/g, // "smH" and "Smh" isn't filtered
    /\bSMH\b/g,
    /\bfam\b/g, // "faM" isn't filtered
    /\bFam\b/g,
    /\bFAM\b/g,
    /\bfams\b/g, // "famS" isn't filtered
    /\bFams\b/g,
    /\bFAMS\b/g,
    /\bsoy/gi,
  ];

  let filtersToRemove = [];

  const board = getBoard();

  switch (board) {
    case 'ck':
    case 'int':
      filtersToRemove = [/\bsoy/gi];
      break;
    case 's4s':
      filtersToRemove = [
        /CUCK/g,
        /\btbh\b/g,
        /\bTBH\b/g,
        /\bsmh\b/g,
        /\bSMH\b/g,
        /\bfam\b/g,
        /\bFam\b/g,
        /\bFAM\b/g,
        /\bfams\b/g,
        /\bFams\b/g,
        /\bFAMS\b/g,
        /\bsoy/gi,
      ];
      break;
    case 'biz':
      wordFilters.push(/monkeypox/gi);
      break;
    case 'mlp':
      wordFilters.push(/barbien\x69gger/gi);
      break;
    case 'v':
      wordFilters.push(
        /pcuck/gi,
        /pcfat/gi,
        /sony\w+[^s]/gi, // sonypony, sonyponies, son\x79gger
        /nint\w+[^s]/gi, // nintendrone, nintenyearold, nintoddler
        /valvedrone/g, // "valvedronE" isn't wordfiltered
        /Valvedrone/g,
        /VALVEDRONE/g,
      );
      break;
  }

  // eslint-disable-next-line
  wordFilters = wordFilters.filter((regex) => {
    return !filtersToRemove.some((toRemove) => regex.toString() === toRemove.toString());
  });

  return {
    characterLimit,
    maxFileSize,
    maxLines,
    hasUserIDs,
    hasBoardFlags,
    wordFilters,
  };
}
