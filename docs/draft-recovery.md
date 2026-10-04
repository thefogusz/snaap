# Draft recovery

Chat text and setup drafts are checkpointed in localStorage under a versioned key containing the authenticated user ID and workspace ID. Only drafting fields are saved; exchange credentials and file bytes are excluded. Setup edits checkpoint synchronously before the existing debounced server save. Page hiding and programmatic changes also checkpoint the draft.

After authentication and workspace loading, the current workspace resumes its draft, unsent text, editing mode and saved conversation reference. Workspace switching checkpoints the outgoing workspace and restores the incoming one. Failed server saves leave the browser copy intact. The online event retries pending setup saves using the existing expected-revision protection; recovery does not activate an alert or place an order.

This is browser-local recovery, not cross-device text synchronization. Clearing browser storage removes the browser copy. A fully offline reload still requires connectivity to load the application and authenticate; when connectivity returns, the saved draft can be restored. Uploaded images remain on the server and are not duplicated into browser storage.

Browser verification: `qa/draft-recovery-browser.js` checks unsent text and indicator/name restoration after refresh while draft requests fail. `qa/draft-workspaces-browser.js` checks workspace separation and retry after a simulated offline/online transition with fixture responses. Initial welcome text recovery was reproduced as failing before implementation.
