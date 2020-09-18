/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { ExtensionSupport } = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");

// Boilerplate to listen for when to set up and tear down our add-on in the
// application's windows.

var deselect = class extends ExtensionCommon.ExtensionAPI {
  getAPI(context) {
    context.callOnClose(this);
    return {
      deselect: {
        init() {
          for (let win of Services.wm.getEnumerator(null)) {
            setupWindow(win);
          }
          ExtensionSupport.registerWindowListener("deselectListener", {
            chromeURLs: [
              "chrome://messenger/content/messenger.xhtml",
              "chrome://messenger/content/messenger.xul",
            ],
            onLoadWindow(win) {
              setupWindow(win);
            },
          });
        },
      },
    };
  }

  close() {
    for (let win of Services.wm.getEnumerator(null)) {
      cleanupWindow(win);
    }
    ExtensionSupport.unregisterWindowListener("deselectListener");
  }
};

function DeletionListener(targetWindow) {
  this.targetWindow = targetWindow;
}

DeletionListener.prototype = {
  onMessagesRemoved: function(display) {
    // Override the next view index, but only if 1) the view gave us an index,
    // and 2) if we didn't right-click another message to delete it; otherwise,
    // we need to let the view handle this itself. If we try to override the
    // view index all the time, deleting a message will cause all tabs to close,
    // since we're telling the display to select an invalid row for all tabs.
    // Likewise, if we were right-clicking another message to delete it, we want
    // Thunderbird to do its usual thing (reselect the old message).
    if (display._nextViewIndexAfterDelete !== null &&
        this.targetWindow.gRightMouseButtonSavedSelection === null) {
      // -1 here will trick the folder display into thinking we're prepared to
      // select another message, but will bail out when we actually try to
      // select it.
      display._nextViewIndexAfterDelete = -1;
    }
  },
};

var deletionListeners = new WeakMap();

function isWindowRelevant(win) {
  let windowtype = win.document.documentElement.getAttribute("windowtype");
  return windowtype === "mail:3pane";
}

function setupWindow(win) {
  let doSetup = (win) => {
    if (isWindowRelevant(win) && !deletionListeners.has(win)) {
      let listener = new DeletionListener(win);
      deletionListeners.set(win, listener);
      win.FolderDisplayListenerManager.registerListener(listener);
    }
  };

  if (win.document.readyState == "complete") {
    doSetup(win);
  } else {
    win.addEventListener("load", function onload() {
      win.removeEventListener("load", onload);
      doSetup(win);
    });
  }
}

function cleanupWindow(win) {
  if (!isWindowRelevant(win))
    return;

  let listener = deletionListeners.get(win);
  win.FolderDisplayListenerManager.unregisterListener(listener);
  deletionListeners.delete(win);
}

