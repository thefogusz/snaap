# Workspaces and personal data

Accounts own workspaces. The first workspace is พื้นที่หลัก. On initialization, existing unassigned setups and chats move there without losing revisions or messages. New setups/chats store the selected workspace. Setup lists, chat lists, monitor status, signals/inbox and agent context filter by the selected workspace. Account quotas remain shared across workspaces.

Free cannot create additional workspaces; POST checks the current paid entitlement on the server. Pro can create additional spaces; no numeric Pro workspace cap has been set pending product decisions. Existing spaces remain available after entitlement expiration. Both tiers can rename owned spaces. Renaming preserves IDs, chats and source scopes. Chat UI and saved conversation listings show the workspace name; chat turns and draft updates validate that the conversation belongs to the selected space.

`scripts/dev.ts` enables `developerPro` for the fixed loopback-only local test account. Local login refreshes its development entitlement to at least 30 days without creating a billing payment or shortening any existing entitlement. Other accounts remain governed by their own entitlements. Production startup does not enable local login or this option.

Images, imported histories and exchange connections default to shared across all workspaces, including future workspaces. Users can restrict each source to one or more of their own workspaces in ข้อมูลของฉัน → ใช้ข้อมูลในเวิร์กสเปซ. Restricting a connection propagates to its imported histories; future syncs inherit that scope. Deleting a source still invalidates references through existing source-availability checks. Sharing is within the same account only.

The selected workspace is passed through `x-snaap-workspace`; backend checks ownership. Scope changes validate both the resource owner and every workspace owner. Context and library filtering occur on the server, not only in the UI. Explicit chat attachments remain separately controlled. Historical messages keep their historical contents.

Workspace selection survives reload per browser session. Switching saves any pending draft, clears the current editor/chat/attachments and loads the selected workspace. Switching while an agent request is running is blocked until the reply completes. All previously active setups continue monitoring across workspaces; workspace selection changes the view, not activation.

Validation: real PostgreSQL integration covers migration, workspace persistence, rule/chat/inbox filtering, shared and restricted sources, context filtering and cross-account denial. Browser tests cover source-scope dialogs, changing workspace request headers and desktop/mobile layout. Scope sharing does not grant access to other user accounts.
