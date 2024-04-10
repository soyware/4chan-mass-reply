browser.runtime.onMessage.addListener((message) => {
  if (message.message === 'deleteCookie') {
    browser.cookies.remove({
      url: message.cookieDomain,
      name: message.cookieName,
    });
  }
});
