# Image storage and mentions

- My Data library: at most 5 images per user across workspaces. Uploads receive the first unused numeric name. Names may be edited, must be unique ignoring case, and support quoted mentions for names containing spaces.
- Existing images remain library images. They are not retroactively removed or renamed.
- Chat uploads: purpose `chat`, owned by a conversation. They are excluded from the library and cannot be used in a different conversation.
- After a successful setup create/update or preset save, temporary assets for that conversation are removed from asset metadata and message image references. Binary deletion is queued durably and attempted immediately; outstanding deletions retry at startup and subsequent cleanup.
- Library images are retained until the user deletes them. Setup-save cleanup never selects library assets.
- Mentions resolve on the server only with `useMyData: true`, within the user's accessible library. The UI offers an @ picker and keyboard selection. The server includes ordered image names with the images supplied to the model.
- A turn may contain 5 library images plus the existing 3 temporary attachment slots. This does not automatically attach the entire library.
- Unfinished conversations retain their temporary uploads until a setup is saved; no idle expiry is currently applied.

Implementation was checked with TypeScript and JavaScript syntax checks. The live library UI displayed the 5-image limit and rename/delete controls. No user images were deleted or renamed during the UI check.
